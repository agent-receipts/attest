import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLine } from "../../src/test-utils/streams.js";

const SERVER_PATH = join(import.meta.dirname, "server.mjs");

function send(
	proc: ReturnType<typeof spawn>,
	msg: Record<string, unknown>,
): void {
	proc.stdin?.write(`${JSON.stringify(msg)}\n`);
}

async function sendAndReceive(
	proc: ReturnType<typeof spawn>,
	out: PassThrough,
	msg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	send(proc, msg);
	const line = await readLine(out);
	return JSON.parse(line);
}

function toolCall(
	id: number,
	name: string,
	args: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		jsonrpc: "2.0",
		id,
		method: "tools/call",
		params: { name, arguments: args },
	};
}

describe("reference MCP server", () => {
	let proc: ReturnType<typeof spawn>;
	let out: PassThrough;
	let sandbox: string;

	beforeEach(() => {
		sandbox = mkdtempSync(join(tmpdir(), "mcp-test-"));
		out = new PassThrough();

		proc = spawn("node", [SERVER_PATH, "--sandbox", sandbox], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		proc.stdout?.pipe(out);
	});

	afterEach(() => {
		proc?.kill();
	});

	describe("tools/list", () => {
		it("returns tool definitions", async () => {
			const res = await sendAndReceive(proc, out, {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
			});

			expect(res.id).toBe(1);
			const tools = (res.result as { tools: { name: string }[] }).tools;
			const names = tools.map((t) => t.name);
			expect(names).toContain("read_file");
			expect(names).toContain("write_file");
			expect(names).toContain("list_directory");
			expect(names).toContain("delete_file");
			expect(names).toContain("move_file");
			expect(tools).toHaveLength(5);
		});
	});

	describe("write_file + read_file", () => {
		it("writes and reads back a file", async () => {
			const writeRes = await sendAndReceive(
				proc,
				out,
				toolCall(1, "write_file", { path: "hello.txt", content: "Hello!" }),
			);
			expect(writeRes.result).toEqual({ written: "hello.txt" });

			const readRes = await sendAndReceive(
				proc,
				out,
				toolCall(2, "read_file", { path: "hello.txt" }),
			);
			expect(readRes.result).toEqual({ content: "Hello!" });
		});

		it("creates intermediate directories", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "write_file", {
					path: "sub/dir/file.txt",
					content: "nested",
				}),
			);
			expect(res.result).toEqual({ written: "sub/dir/file.txt" });
		});
	});

	describe("list_directory", () => {
		it("lists sandbox root", async () => {
			writeFileSync(join(sandbox, "a.txt"), "a");
			writeFileSync(join(sandbox, "b.txt"), "b");

			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "list_directory", {}),
			);
			const entries = (res.result as { entries: { name: string }[] }).entries;
			const names = entries.map((e) => e.name).sort();
			expect(names).toEqual(["a.txt", "b.txt"]);
		});
	});

	describe("delete_file", () => {
		it("deletes a file", async () => {
			writeFileSync(join(sandbox, "doomed.txt"), "bye");

			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "delete_file", { path: "doomed.txt" }),
			);
			expect(res.result).toEqual({ deleted: "doomed.txt" });

			const readRes = await sendAndReceive(
				proc,
				out,
				toolCall(2, "read_file", { path: "doomed.txt" }),
			);
			expect(readRes.error).toBeDefined();
		});
	});

	describe("move_file", () => {
		it("moves a file", async () => {
			writeFileSync(join(sandbox, "old.txt"), "data");

			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "move_file", {
					source: "old.txt",
					destination: "new.txt",
				}),
			);
			expect(res.result).toEqual({
				moved: { from: "old.txt", to: "new.txt" },
			});

			const readRes = await sendAndReceive(
				proc,
				out,
				toolCall(2, "read_file", { path: "new.txt" }),
			);
			expect(readRes.result).toEqual({ content: "data" });
		});
	});

	describe("sandbox confinement", () => {
		it("rejects path traversal on read_file", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "read_file", { path: "../../etc/passwd" }),
			);
			expect(res.error).toBeDefined();
			expect((res.error as { message: string }).message).toMatch(/sandbox/i);
		});

		it("rejects path traversal on write_file", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "write_file", {
					path: "../escape.txt",
					content: "nope",
				}),
			);
			expect(res.error).toBeDefined();
		});

		it("rejects path traversal on delete_file", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "delete_file", { path: "/etc/passwd" }),
			);
			expect(res.error).toBeDefined();
		});

		it("rejects path traversal on move_file source", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "move_file", {
					source: "../outside.txt",
					destination: "inside.txt",
				}),
			);
			expect(res.error).toBeDefined();
		});
	});

	describe("error handling", () => {
		it("returns error for unknown tool", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "nonexistent_tool", {}),
			);
			expect(res.error).toBeDefined();
			expect((res.error as { code: number }).code).toBe(-32601);
		});

		it("returns error for unknown method", async () => {
			const res = await sendAndReceive(proc, out, {
				jsonrpc: "2.0",
				id: 1,
				method: "unknown/method",
			});
			expect(res.error).toBeDefined();
		});

		it("returns error for reading nonexistent file", async () => {
			const res = await sendAndReceive(
				proc,
				out,
				toolCall(1, "read_file", { path: "nope.txt" }),
			);
			expect(res.error).toBeDefined();
		});

		it("ignores notifications (no id)", async () => {
			send(proc, { jsonrpc: "2.0", method: "notifications/test" });

			// Send a real request to verify the server is still responsive
			const res = await sendAndReceive(proc, out, {
				jsonrpc: "2.0",
				id: 99,
				method: "tools/list",
			});
			expect(res.id).toBe(99);
		});
	});
});
