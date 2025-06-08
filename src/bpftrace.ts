import { spawn, StdioOptions } from "child_process";
import * as readline from "readline";
import { Readable, Stream } from "stream";

interface Output {
    stdin: Stream.Writable | null,
    stdout: readline.Interface | null,
    stderr: readline.Interface | null,
}

export function runBpftrace(args: string[], stdio: StdioOptions): Output {
    const process = spawn("sudo", args, { stdio, shell: false });

    const stdin = process.stdin;
    const stdout = process.stdout === null ? null : readLines(process.stdout);
    const stderr = process.stderr === null ? null : readLines(process.stderr);

    // stdout?.on("line", line => console.log("stdout", line));
    stderr?.on("line", line => console.log("stderr", line));
    return { stdin, stdout, stderr };
}

function readLines(input: Readable): readline.Interface {
    return readline.createInterface({ input });
}

