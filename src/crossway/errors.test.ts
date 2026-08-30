import { CrosswayError } from "./errors";

describe("CrosswayError", () => {
	test("sets name, message, and kind", () => {
		const err = new CrosswayError("Scripturizer: bad key", "auth");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("CrosswayError");
		expect(err.message).toBe("Scripturizer: bad key");
		expect(err.kind).toBe("auth");
	});

	test.each(["auth", "not-found", "network", "malformed-response", "verse-mismatch"] as const)(
		"kind %s round-trips",
		(kind) => {
			expect(new CrosswayError("m", kind).kind).toBe(kind);
		},
	);
});