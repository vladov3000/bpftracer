import { TextDocument } from "vscode-languageserver-textdocument";
import {
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
    createConnection
} from "vscode-languageserver/node";
import { complete } from "./completion";
import { emitDiagnostics } from "./diagnostic";

function initialize(_: InitializeParams): InitializeResult {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                triggerCharacters: [":", "$", "@"]
            }
        },
    };
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(initialize);
connection.onCompletion(complete.bind(null, documents));

documents.onDidChangeContent(emitDiagnostics.bind(null, connection));
documents.listen(connection);

connection.listen();
