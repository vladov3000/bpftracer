import * as readline from "readline";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompletionItem, CompletionItemKind, CompletionParams, Position, TextDocuments } from "vscode-languageserver/node";
import { runBpftrace } from "./bpftrace";

export async function complete(documents: TextDocuments<TextDocument>, parameters: CompletionParams): Promise<CompletionItem[]> {
    const document = documents.get(parameters.textDocument.uri);
    if (document === undefined) {
        return [];
    }

    const triggerCharacter = parameters.context?.triggerCharacter;
    const position = parameters.position;

    if (triggerCharacter === ":") {
        return completeAttachPoint(document, position);
    } else if (triggerCharacter === "$" || triggerCharacter === "@") {
        return completeVariables(document, position, triggerCharacter);
    } else {
        return [];
    }
}

function completeVariables(document: TextDocument, position: Position, triggerCharacter: string): CompletionItem[] {
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: position,
    });
    const base = line.slice(line.lastIndexOf(triggerCharacter));

    // Escape $ in regex.
    if (triggerCharacter == "$") {
        triggerCharacter = "\\$";
    }

    const regexp = new RegExp(`${triggerCharacter}[_a-zA-Z][_a-zA-Z0-9]*`, "g");
    const matches = document.getText().matchAll(regexp);
    const seen = new Set<string>();
    const output: CompletionItem[] = [];

    for (const match of matches) {
        const label = match[0].slice(base.length);

        if (seen.has(label)) {
            continue;
        }
        seen.add(label);

        const completion = {
            label: label,
            kind: CompletionItemKind.Variable,
            detail: triggerCharacter === ":" ? "Map" : "Variable",
        }

        output.push(completion);
    }

    return output;
}

async function completeAttachPoint(document: TextDocument, position: Position): Promise<CompletionItem[]> {
    const attachPoint = getAttachPoint(document, position);
    const { stdout } = runBpftrace(["bpftrace", "-l", `${attachPoint}*`], ["ignore", "pipe", "ignore"]);
    return getCompletions(stdout!, attachPoint);
}

async function getCompletions(stdout: readline.Interface, base: string): Promise<CompletionItem[]> {
    return new Promise(resolve => {
        const completions: CompletionItem[] = [];
        stdout.on("line", addCompletion.bind(null, completions, base));
        stdout.on("close", () => resolve(completions));
    });
}

function addCompletion(completions: CompletionItem[], base: string, line: string): void {
    const completion = {
        label: line.slice(base.length),
        kind: CompletionItemKind.Event,
        detail: "BPF Tracepoint",
    };
    completions.push(completion);
}

function getAttachPoint(document: TextDocument, position: Position): string {
    const output: string[] = [];

    while (true) {
        const line = document.getText({
            start: { line: position.line, character: 0 },
            end: position
        });

        const match = line.match(/(?<attachPoint>[\s:_a-zA-Z0-9]*)$/);
        const attachPoint = match?.groups?.attachPoint;
        if (attachPoint === undefined) {
            break;
        }

        output.push(attachPoint);

        if (attachPoint.length !== line.length) {
            break;
        }

        if (position.line > 0) {
            position.line -= 1;
            position.character = Number.MAX_SAFE_INTEGER;
        } else {
            break;
        }
    }

    output.reverse();
    return removeWhitespace(output.join(""));
}

function removeWhitespace(input: string): string {
    return input.replace(/\s+/g, "");
}
