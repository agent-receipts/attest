import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "@attest-protocol/attest-ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROXY_CLI = join(__dirname, "..", "..", "dist", "proxy", "main.js");
const ECHO_SERVER = join(__dirname, "fixtures", "echo-server.mjs");

describe("attest-proxy CLI", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "attest-proxy-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true });
	});

	it("shows help with --help", () => {
		const output = execFileSync("node", [PROXY_CLI, "--help"], {
			encoding: "utf-8",
		});
		expect(output).toContain("Usage: attest-proxy");
		expect(output).toContain("--taxonomy");
	});

	it("exits with error when no command provided", () => {
		try {
			execFileSync("node", [PROXY_CLI], {
				encoding: "utf-8",
				stdio: "pipe",
			});
			expect.unreachable("should have thrown");
		} catch (error) {
			const err = error as { status: number };
			expect(err.status).toBe(1);
		}
	});

	it("proxies a server and records receipts", { timeout: 10000 }, async () => {
		const dbPath = join(tempDir, "test.db");
		const taxonomyPath = join(tempDir, "taxonomy.json");

		writeFileSync(
			taxonomyPath,
			JSON.stringify({
				mappings: [
					{
						tool_name: "read_file",
						action_type: "filesystem.file.read",
					},
				],
			}),
		);

		// Spawn the proxy
		const proxy: ChildProcess = spawn(
			"node",
			[
				PROXY_CLI,
				"--db",
				dbPath,
				"--taxonomy",
				taxonomyPath,
				"--issuer",
				"did:agent:test",
				"--principal",
				"did:user:test",
				"--chain",
				"chain_e2e",
				"node",
				ECHO_SERVER,
			],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);

		try {
			// Wait for proxy to start
			await new Promise((r) => setTimeout(r, 500));

			// Set up response listener before sending
			const responsePromise = new Promise<void>((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error("No response from proxy")),
					5000,
				);
				proxy.stdout?.once("data", () => {
					clearTimeout(timer);
					// Give emitter time to store the receipt
					setTimeout(resolve, 200);
				});
			});

			// Send a tools/call request
			const request = JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: "read_file", arguments: { path: "/tmp/test" } },
			});
			proxy.stdin?.write(`${request}\n`);

			await responsePromise;
		} finally {
			proxy.kill();
			// Wait for close
			await new Promise<void>((resolve) => {
				proxy.on("close", () => resolve());
			});
		}

		// Verify receipts were stored
		const store = openStore(dbPath);
		try {
			const chain = store.getChain("chain_e2e");
			expect(chain).toHaveLength(1);
			expect(chain[0]?.credentialSubject.action.type).toBe(
				"filesystem.file.read",
			);
			expect(chain[0]?.issuer.id).toBe("did:agent:test");
		} finally {
			store.close();
		}
	});
});
