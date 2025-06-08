import * as readline from "readline";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompletionItem, CompletionItemKind, CompletionParams, CompletionTriggerKind, Position, TextDocuments } from "vscode-languageserver/node";
import { runBpftrace } from "./bpftrace";

export async function complete(documents: TextDocuments<TextDocument>, parameters: CompletionParams): Promise<CompletionItem[]> {
    if (parameters.context?.triggerKind !== CompletionTriggerKind.TriggerCharacter) {
        return [];
    }

    const document = documents.get(parameters.textDocument.uri);
    if (document === undefined) {
        return [];
    }

    const attachPoint = getAttachPoint(document, parameters.position);
    const { stdout } = runBpftrace(["bpftrace", "-l", `${attachPoint}*`], ["ignore", "pipe", "ignore"]);
    return getCompletions(stdout!, attachPoint);
}

async function getCompletions(stdout: readline.Interface, base: string): Promise<CompletionItem[]> {
    return new Promise(resolve => {
        const completions: CompletionItem[] = [];
        stdout.on("line", line => completions.push({
            label: line.slice(base.length),
            kind: CompletionItemKind.Event,
            detail: "BPF Tracepoint"
        }));
        stdout.on("close", () => resolve(completions));
    });
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
