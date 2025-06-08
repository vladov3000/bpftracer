import * as readline from "readline";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    Connection,
    Diagnostic,
    DiagnosticSeverity,
    TextDocumentChangeEvent
} from "vscode-languageserver/node";
import { runBpftrace } from "./bpftrace";

export async function emitDiagnostics(connection: Connection, event: TextDocumentChangeEvent<TextDocument>): Promise<void> {
    const program = event.document.getText();

    const { stdin, stderr } = runBpftrace(["bpftrace", "-c", "true", "-"], ["pipe", "ignore", "pipe"]);
    stdin!.write(program);
    stdin!.end();

    const diagnostics = await parseDiagnostics(stderr!);
    if (diagnostics === null) {
        await connection.sendRequest("error");
        return;
    }

    await connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics: diagnostics,
    });
}

async function parseDiagnostics(stderr: readline.Interface): Promise<Diagnostic[] | null> {
    return await new Promise(resolve => {
        const diagonstics: Diagnostic[] = [];
        stderr.on("line", line => onStderrLine(line, diagonstics, () => resolve(null)));
        stderr.on("close", () => resolve(diagonstics));
    });
}

async function onStderrLine(line: string, diagnostics: Diagnostic[], onPasswordError: () => void): Promise<void> {
    if (line === "sudo: a password is required") {
        onPasswordError();
    }

    const diagnostic = parseDiagnostic(line);
    if (diagnostic !== null) {
        diagnostics.push(diagnostic);
    }
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