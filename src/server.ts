import { TextDocument } from "vscode-languageserver-textdocument";
import {
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
    createConnection
} from "vscode-languageserver/node";
import { emitDiagnostics } from "./diagnostic";

function initialize(_: InitializeParams): InitializeResult {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
        }
    };
}

const connection = createConnection(ProposedFeatures.all);
connection.onInitialize(initialize);

const documents = new TextDocuments(TextDocument);
documents.onDidChangeContent(emitDiagnostics.bind(null, connection));
documents.listen(connection);

connection.listen();
