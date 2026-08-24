import { requestUrl } from "obsidian";
import { ApiBibleError } from "./errors";

// Base host per API.Bible's own documentation. `requestUrl` (not `fetch`) is used throughout
// for CORS-safety and mobile compatibility, per this project's Obsidian plugin conventions.
const BASE_URL = "https://rest.api.bible";

export { ApiBibleError };

async function get(path: string, apiKey: string): Promise<unknown> {
	if (!apiKey) {
		throw new ApiBibleError("Scripturizer: no API.Bible key configured in settings", "auth");
	}

	let response;
	try {
		response = await requestUrl({
			url: `${BASE_URL}${path}`,
			headers: { "api-key": apiKey },
			throw: false,
		});
	} catch {
		throw new ApiBibleError("Scripturizer: network error contacting API.Bible", "network");
	}

	if (response.status === 401 || response.status === 403) {
		throw new ApiBibleError("Scripturizer: API.Bible rejected the configured API key", "auth");
	}
	if (response.status === 404) {
		throw new ApiBibleError("Scripturizer: API.Bible returned 404 for this request", "not-found");
	}
	if (response.status < 200 || response.status >= 300) {
		throw new ApiBibleError(`Scripturizer: API.Bible request failed (HTTP ${response.status})`, "network");
	}

	try {
		return response.json;
	} catch {
		throw new ApiBibleError("Scripturizer: API.Bible returned a malformed response", "malformed-response");
	}
}

export interface BibleCatalogEntry {
	id: string;
	abbreviation: string;
	name: string;
}

export async function fetchEnglishBibles(apiKey: string): Promise<BibleCatalogEntry[]> {
	const body = await get("/v1/bibles?language=eng", apiKey);
	if (typeof body !== "object" || body === null || !("data" in body) || !Array.isArray(body.data)) {
		throw new ApiBibleError("Scripturizer: unexpected /v1/bibles response shape", "malformed-response");
	}
	return body.data as BibleCatalogEntry[];
}

export async function fetchPassage(bibleId: string, passageId: string, apiKey: string): Promise<unknown> {
	const path =
		`/v1/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(passageId)}` +
		`?content-type=json&include-verse-numbers=true&include-titles=false` +
		`&include-chapter-numbers=false&include-notes=false`;
	const body = await get(path, apiKey);
	if (typeof body !== "object" || body === null || !("data" in body)) {
		throw new ApiBibleError("Scripturizer: unexpected passage response shape", "malformed-response");
	}
	return body.data;
}
