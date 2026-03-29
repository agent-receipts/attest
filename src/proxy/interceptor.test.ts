import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolCallComplete, ToolCallRequest } from "./interceptor.js";
import { ToolCallInterceptor } from "./interceptor.js";
import type { JsonRpcMessage } from "./proxy.js";
import { McpProxy } from "./proxy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ECHO_SERVER = join(__dirname, "fixtures", "echo-server.mjs");

describe("ToolCallInterceptor", () => {
	let proxy: McpProxy;
	let interceptor: ToolCallInterceptor;

	afterEach(() => {
		proxy?.stop();
	});

	function setup(): { clientIn: PassThrough; clientOut: PassThrough } {
		proxy = new McpProxy("node", [ECHO_SERVER]);
		interceptor = new ToolCallInterceptor();
		interceptor.attach(proxy);

		const clientIn = new PassThrough();
		const clientOut = new PassThrough();
		proxy.start(clientIn, clientOut);

		return { clientIn, clientOut };
	}

	it("emits tool:request for tools/call messages", async () => {
		const { clientIn } = setup();

		const requests: ToolCallRequest[] = [];
		interceptor.on("tool:request", (req) => requests.push(req));

		const msg: JsonRpcMessage = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "read_file", arguments: { path: "/tmp/test" } },
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);

		await new Promise((r) => setTimeout(r, 50));

		expect(requests).toHaveLength(1);
		expect(requests[0]?.toolName).toBe("read_file");
		expect(requests[0]?.arguments).toEqual({ path: "/tmp/test" });
		expect(requests[0]?.id).toBe(1);
	});

	it("emits tool:complete when response arrives", async () => {
		const { clientIn, clientOut } = setup();

		const completions: ToolCallComplete[] = [];
		interceptor.on("tool:complete", (c) => completions.push(c));

		const msg: JsonRpcMessage = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "read_file", arguments: { path: "/tmp/test" } },
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);

		await readLine(clientOut);

		expect(completions).toHaveLength(1);
		expect(completions[0]?.request.toolName).toBe("read_file");
		expect(completions[0]?.result).toBeDefined();
		expect(completions[0]?.error).toBeUndefined();
	});

	it("ignores non-tools/call methods", async () => {
		const { clientIn } = setup();

		const requests: ToolCallRequest[] = [];
		interceptor.on("tool:request", (req) => requests.push(req));

		const msg: JsonRpcMessage = {
			jsonrpc: "2.0",
			id: 1,
			method: "resources/list",
			params: {},
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);

		await new Promise((r) => setTimeout(r, 50));

		expect(requests).toHaveLength(0);
	});

	it("ignores notifications (no id)", async () => {
		const { clientIn } = setup();

		const requests: ToolCallRequest[] = [];
		interceptor.on("tool:request", (req) => requests.push(req));

		const msg = {
			jsonrpc: "2.0",
			method: "tools/call",
			params: { name: "test" },
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);

		await new Promise((r) => setTimeout(r, 50));

		expect(requests).toHaveLength(0);
	});

	it("clears pending after response", async () => {
		const { clientIn, clientOut } = setup();

		expect(interceptor.pendingCount).toBe(0);

		const msg: JsonRpcMessage = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "test", arguments: {} },
		};
		clientIn.write(`${JSON.stringify(msg)}\n`);

		// Wait for full round-trip
		await readLine(clientOut);
		expect(interceptor.pendingCount).toBe(0);
	});

	it("pairs multiple concurrent requests by id", async () => {
		const { clientIn, clientOut } = setup();

		const completions: ToolCallComplete[] = [];
		interceptor.on("tool:complete", (c) => completions.push(c));

		// Send two requests
		for (const id of [1, 2]) {
			const msg: JsonRpcMessage = {
				jsonrpc: "2.0",
				id,
				method: "tools/call",
				params: { name: `tool_${id}`, arguments: {} },
			};
			clientIn.write(`${JSON.stringify(msg)}\n`);
		}

		// Read both responses
		await readLine(clientOut);
		await readLine(clientOut);

		expect(completions).toHaveLength(2);
		const toolNames = completions.map((c) => c.request.toolName).sort();
		expect(toolNames).toEqual(["tool_1", "tool_2"]);
	});

	it("throws if attached twice", () => {
		setup();

		const proxy2 = new McpProxy("node", [ECHO_SERVER]);
		expect(() => interceptor.attach(proxy2)).toThrow("already attached");
	});
});

function readLine(stream: PassThrough): Promise<string> {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const timer = setTimeout(
			() => reject(new Error("Timeout waiting for line")),
			5000,
		);
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString();
			const newlineIdx = buffer.indexOf("\n");
			if (newlineIdx !== -1) {
				clearTimeout(timer);
				stream.off("data", onData);
				resolve(buffer.slice(0, newlineIdx));
			}
		};
		stream.on("data", onData);
	});
}
