import { describe, it, expect } from "vitest";
import { trimIdent } from "./trimIdent";

describe("trimIdent", () => {
    it("trims shared indentation and removes blank edges", () => {
        const raw = `
            function hello() {
                return "world";
            }
        `;
        const trimmed = trimIdent(raw);

        expect(trimmed).toBe('function hello() {\n    return "world";\n}');
    });

    it("normalizes CRLF input before trimming", () => {
        const crlf = "\r\n        one\r\n        two\r\n";
        expect(trimIdent(crlf)).toBe("one\ntwo");
    });
});
