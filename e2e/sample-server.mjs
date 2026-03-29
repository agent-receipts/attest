#!/usr/bin/env node

/**
 * Sample MCP server for E2E testing with attest-proxy.
 *
 * Implements a minimal MCP server over STDIO with two tools:
 * - read_file: reads a file (simulated)
 * - write_file: writes a file (simulated)
 *
 * Responds to initialize, tools/list, and tools/call.
 */

import { createInterface } from "node:readline";

const TOOLS = [
	{
		name: "read_file",
		description: "Read a file from the filesystem",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to read" },
			},
			required: ["path"],
		},
	},
	{
		name: "write_file",
		description: "Write content to a file",
		inputSchema: {
			type: "object",
			properties: {
				path: { type: "string", description: "File path to write" },
				content: { type: "string", description: "Content to write" },
			},
			required: ["path", "content"],
		},
	},
];

function handleRequest(msg) {
	if (msg.method === "initialize") {
		return {
			jsonrpc: "2.0",
			id: msg.id,
			result: {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: { name: "sample-server", version: "0.1.0" },
			},
		};
	}

	if (msg.method === "notifications/initialized") {
		return null; // notification, no response
	}

	if (msg.method === "tools/list") {
		return {
			jsonrpc: "2.0",
			id: msg.id,
			result: { tools: TOOLS },
		};
	}

	if (msg.method === "tools/call") {
		const toolName = msg.params?.name;
		const args = msg.params?.arguments ?? {};

		if (toolName === "read_file") {
			return {
				jsonrpc: "2.0",
				id: msg.id,
				result: {
					content: [
						{
							type: "text",
							text: `Contents of ${args.path}:\nHello from sample-server!`,
						},
					],
				},
			};
		}

		if (toolName === "write_file") {
			return {
				jsonrpc: "2.0",
				id: msg.id,
				result: {
					content: [
						{
							type: "text",
							text: `Successfully wrote ${args.content?.length ?? 0} bytes to ${args.path}`,
						},
					],
				},
			};
		}

		return {
			jsonrpc: "2.0",
			id: msg.id,
			error: { code: -32601, message: `Unknown tool: ${toolName}` },
		};
	}

	// Unknown method
	if (msg.id !== undefined) {
		return {
			jsonrpc: "2.0",
			id: msg.id,
			error: { code: -32601, message: `Unknown method: ${msg.method}` },
		};
	}

	return null;
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
	try {
		const msg = JSON.parse(line);
		const response = handleRequest(msg);
		if (response) {
			process.stdout.write(`${JSON.stringify(response)}\n`);
		}
	} catch {
		// Ignore parse errors
	}
});
