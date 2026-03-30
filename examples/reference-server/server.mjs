/**
 * Reference MCP server with sandboxed filesystem tools.
 *
 * Implements the MCP STDIO transport (newline-delimited JSON-RPC 2.0)
 * with five tools spanning low/medium/high risk levels:
 *
 *   read_file       (low)    - read file contents
 *   write_file      (low)    - create or overwrite a file
 *   list_directory   (low)    - list directory entries
 *   delete_file     (high)   - remove a file
 *   move_file       (medium) - rename or move a file
 *
 * All paths are confined to a sandbox directory.
 *
 * Usage:
 *   node server.mjs [--sandbox <dir>]
 *
 *   # Through the attest proxy:
 *   attest-proxy --taxonomy taxonomy.json -- node server.mjs
 */

import { mkdtempSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";

// --- CLI args ---

function parseSandbox() {
	const idx = process.argv.indexOf("--sandbox");
	if (idx !== -1 && process.argv[idx + 1]) {
		return resolve(process.argv[idx + 1]);
	}
	return mkdtempSync(join(tmpdir(), "mcp-ref-"));
}

const SANDBOX = parseSandbox();

// Ensure sandbox exists
await mkdir(SANDBOX, { recursive: true });

// --- Path safety ---

function safePath(userPath) {
	const resolved = resolve(SANDBOX, userPath);
	const rel = relative(SANDBOX, resolved);
	if (rel.startsWith("..") || resolve(SANDBOX, rel) !== resolved) {
		return null;
	}
	return resolved;
}

// --- Tool definitions ---

const TOOLS = [
	{
		name: "read_file",
		description: "Read the contents of a file",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Relative path within sandbox" },
			},
			required: ["path"],
		},
	},
	{
		name: "write_file",
		description: "Create or overwrite a file",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Relative path within sandbox" },
				content: { type: "string", description: "File content to write" },
			},
			required: ["path", "content"],
		},
	},
	{
		name: "list_directory",
		description: "List entries in a directory",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Relative path within sandbox (defaults to root)",
				},
			},
		},
	},
	{
		name: "delete_file",
		description: "Delete a file",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "Relative path within sandbox" },
			},
			required: ["path"],
		},
	},
	{
		name: "move_file",
		description: "Move or rename a file",
		inputSchema: {
			type: "object",
			properties: {
				source: { type: "string", description: "Source path (relative)" },
				destination: {
					type: "string",
					description: "Destination path (relative)",
				},
			},
			required: ["source", "destination"],
		},
	},
];

// --- Tool handlers ---

async function handleReadFile(args) {
	const p = safePath(args.path);
	if (!p) throw new Error("Path escapes sandbox");
	const content = await readFile(p, "utf-8");
	return { content };
}

async function handleWriteFile(args) {
	const p = safePath(args.path);
	if (!p) throw new Error("Path escapes sandbox");
	await mkdir(resolve(p, ".."), { recursive: true });
	await writeFile(p, args.content, "utf-8");
	return { written: args.path };
}

async function handleListDirectory(args) {
	const p = safePath(args.path ?? ".");
	if (!p) throw new Error("Path escapes sandbox");
	const entries = await readdir(p, { withFileTypes: true });
	return {
		entries: entries.map((e) => ({
			name: e.name,
			type: e.isDirectory() ? "directory" : "file",
		})),
	};
}

async function handleDeleteFile(args) {
	const p = safePath(args.path);
	if (!p) throw new Error("Path escapes sandbox");
	await unlink(p);
	return { deleted: args.path };
}

async function handleMoveFile(args) {
	const src = safePath(args.source);
	const dst = safePath(args.destination);
	if (!src || !dst) throw new Error("Path escapes sandbox");
	await mkdir(resolve(dst, ".."), { recursive: true });
	await rename(src, dst);
	return { moved: { from: args.source, to: args.destination } };
}

const HANDLERS = {
	read_file: handleReadFile,
	write_file: handleWriteFile,
	list_directory: handleListDirectory,
	delete_file: handleDeleteFile,
	move_file: handleMoveFile,
};

// --- JSON-RPC dispatch ---

function jsonRpcError(id, code, message) {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

function jsonRpcResult(id, result) {
	return { jsonrpc: "2.0", id, result };
}

async function handleMessage(msg) {
	if (msg.id === undefined) return null; // notification — ignore

	if (msg.method === "tools/list") {
		return jsonRpcResult(msg.id, { tools: TOOLS });
	}

	if (msg.method === "tools/call") {
		const toolName = msg.params?.name;
		const handler = HANDLERS[toolName];
		if (!handler) {
			return jsonRpcError(msg.id, -32601, `Unknown tool: ${toolName}`);
		}
		try {
			const result = await handler(msg.params?.arguments ?? {});
			return jsonRpcResult(msg.id, result);
		} catch (err) {
			return jsonRpcError(msg.id, -1, err.message);
		}
	}

	return jsonRpcError(msg.id, -32601, `Unknown method: ${msg.method}`);
}

// --- STDIO transport ---

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
	try {
		const msg = JSON.parse(line);
		const response = await handleMessage(msg);
		if (response) {
			process.stdout.write(`${JSON.stringify(response)}\n`);
		}
	} catch {
		// Ignore malformed JSON
	}
});
