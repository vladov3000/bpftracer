import { spawn } from "child_process";
import * as readline from "readline";
import { Readable } from "stream";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    Diagnostic,
    DiagnosticSeverity,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentChangeEvent,
    TextDocumentSyncKind,
    TextDocuments,
    createConnection
} from "vscode-languageserver/node";

function initialize(_: InitializeParams): InitializeResult {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
        }
    };
}

async function emitDiagnostics(event: TextDocumentChangeEvent<TextDocument>): Promise<void> {
    const program = event.document.getText();

    const diagnostics = await runBpftrace(program);
    if (diagnostics === null) {
        await connection.sendRequest("warning");
        return;
    }

    await connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: diagnostics,
    });
}

async function runBpftrace(program: string): Promise<Diagnostic[] | null> {
    const process = spawn("sudo", ["bpftrace", "-c", "true", "-"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false
    });

    process.stdin.write(program);
    process.stdin.end();

    const stdoutLines = readLines(process.stdout);
    const stderrLines = readLines(process.stderr);

    stdoutLines.on("line", line => {
        console.log("stdout", line);
    });

    return new Promise(resolve => {
        const diagonstics: Diagnostic[] = [];
        stderrLines.on("line", line => onStderrLine(program, line, diagonstics, () => resolve(null)));
        stderrLines.on("close", () => resolve(diagonstics));
    });
}

function readLines(input: Readable): readline.Interface {
    return readline.createInterface({ input });
}

async function onStderrLine(program: string, line: string, diagnostics: Diagnostic[], onPasswordError: () => void): Promise<void> {
    if (line.startsWith(program)) {
        line = line.slice(program.length);
    }

    if (line === "sudo: a password is required") {
        onPasswordError();
    }

    const diagnostic = parseDiagnostic(line);
    console.log(diagnostic);

    if (diagnostic !== null) {
        diagnostics.push(diagnostic);
    }

    console.log("stderr", line);
}

const diagnosticLine = /^stdin:(?<lineStart>\d+)(-(?<lineEnd>\d+))?:((?<columnStart>\d+)-(?<columnEnd>\d+):)? (?<severity>.*?): (?<message>.*)/;

function parseDiagnostic(input: string): Diagnostic | null {
    /*
     * Example input:
     * :4:1-1: ERROR: syntax error, unexpected end of file, expecting }
     */
    const groups = input.match(diagnosticLine)?.groups;
    if (groups === undefined || groups.lineStart === undefined) {
        return null;
    }

    /*
     * Visual Studio Code uses zero-based indexing, while bpftrace uses one-based indexing, so we decrement numbers.
     * However, Visual Studio Code uses exclusive ranges, while bpftrace uses inclusive ones, so we do not decrement
     * the column end.
     */
    const lineStart = Number(groups.lineStart) - 1;
    let lineEnd = groups.lineEnd === undefined ? lineStart : (Number(groups.lineEnd) - 1);
    const columnStart = groups.columnStart === undefined ? 0 : (Number(groups.columnStart) - 1);
    const columnEnd = groups.columnEnd === undefined ? 0 : (Number(groups.columnStart) - 1);
    const severity = groups.severity === "ERROR" ? DiagnosticSeverity.Error : DiagnosticSeverity.Information;

    // If columnEnd == 0 the last line is not covered, so we increment the lineEnd to compensate.
    if (groups.columnEnd === undefined) {
        lineEnd += 1;
    }

    return {
        range: {
            start: { line: lineStart, character: columnStart },
            end: { line: lineEnd, character: columnEnd },
        },
        severity,
        message: groups.message,
        source: "bpftrace",
    };
}

const connection = createConnection(ProposedFeatures.all);
connection.onInitialize(initialize);

const documents = new TextDocuments(TextDocument);
documents.onDidChangeContent(emitDiagnostics);
documents.listen(connection);

connection.listen();
