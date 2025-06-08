import * as path from "path";
import { commands, ExtensionContext, window, workspace } from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    NodeModule,
    ServerOptions,
    TransportKind
} from "vscode-languageclient/node";

/*
 * Users will need to allow passwordless bpftrace: 
 * echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/bpftrace" | sudo tee /etc/sudoers.d/bpftrace-nopass
 * 
 * Or on NixOS:
 * security.sudo.extraRules = ''
 *  yourusername ALL=(ALL) NOPASSWD: /run/current-system/sw/bin/bpftrace
 * '';
 */

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
    const server = context.asAbsolutePath(path.join("out", "server.js"));
    const module: NodeModule = { module: server, transport: TransportKind.ipc };
    const serverOptions: ServerOptions = { run: module, debug: module };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "bpftrace" }],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher("**/*.bt")
        }
    };

    client = new LanguageClient("bpftrace", serverOptions, clientOptions);
    client.start();
    client.onRequest("error", onError);

    const disposable = commands.registerCommand("bpftrace.restartLanguageServer", restart);
    context.subscriptions.push(disposable);
}

async function onError(): Promise<void> {
    await window.showErrorMessage(`
        bpftrace only supports running as the root user. Please run the following command and restart the language server:
        echo "$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/bpftrace" | sudo tee /etc/sudoers.d/bpftrace-nopass
    `);
}

async function restart(): Promise<void> {
    if (client !== undefined) {
        await client.restart();
    }
}

export async function deactivate(): Promise<void> {
    if (client !== undefined) {
        client.stop();
    }
}
