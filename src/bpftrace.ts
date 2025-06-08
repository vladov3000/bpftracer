import { spawn } from "child_process";
import * as readline from "readline";
import { Readable } from "stream";

export function runBpftrace(program: string): readline.Interface {
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
    return stderrLines;
}

function readLines(input: Readable): readline.Interface {
    return readline.createInterface({ input });
}

