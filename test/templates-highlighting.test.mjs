import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import textmate from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';

const require = createRequire(import.meta.url);
await oniguruma.loadWASM(await readFile(require.resolve('vscode-oniguruma/release/onig.wasm')));
const registryOptions = {
    onigLib: Promise.resolve({
        createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
        createOnigString: text => new oniguruma.OnigString(text)
    }),
    async loadGrammar(scope) {
        const name = { 'source.abc': 'abc', 'source.abcconfig': 'abcconfig' }[scope];
        assert.ok(name, `Unexpected grammar ${scope}`);
        const filename = new URL(`../language/${name}.tmGrammar.json`, import.meta.url);
        return textmate.parseRawGrammar(await readFile(filename, 'utf8'), filename.pathname);
    }
};
const registry = new textmate.Registry(registryOptions);

for (const scope of ['source.abc', 'source.abcconfig']) {
    const grammar = await registry.loadGrammar(scope);
    function scopesAt(line, text) {
        const index = line.indexOf(text);
        assert.ok(index >= 0);
        const token = grammar.tokenizeLine(line).tokens.find(token => token.startIndex <= index && token.endIndex > index);
        assert.ok(token);
        return token.scopes;
    }
    test(`${scope}: template definitions and calls have distinct themed scopes`, () => {
        const definition = '  %%template entrée finale-2.test_3  ';
        assert.ok(scopesAt(definition, '%%template').includes('keyword.control.template.abc'));
        assert.ok(scopesAt(definition, 'entrée finale-2.test_3').includes('entity.name.function.template.abc'));
        assert.ok(scopesAt('  %%endtemplate', '%%endtemplate').includes('keyword.control.template.abc'));
        for (const line of ['{{entrée finale-2.test_3}}', 'C {{ entrée finale-2.test_3 }} DE | {{polca}} F']) {
            assert.ok(scopesAt(line, '{{').includes('punctuation.definition.template.begin.abc'));
            assert.ok(scopesAt(line, 'entrée finale-2.test_3').includes('support.function.template.abc'));
            assert.ok(scopesAt(line, '}}').includes('punctuation.definition.template.end.abc'));
        }
        assert.ok(scopesAt('C {{polca}} D {{break final}} E', 'break final').includes('support.function.template.abc'));
    });
    test(`${scope}: classic themes color templates even without function color rules`, async () => {
        for (const [foreground, keyword, functionColor] of [
            ['#000000', '#0000FF', undefined],
            ['#D4D4D4', '#569CD6', undefined],
            ['#000000', '#0000FF', '#795E26']
        ]) {
            const themedRegistry = new textmate.Registry({
                ...registryOptions,
                theme: {
                    settings: [
                        { settings: { foreground } },
                        { scope: 'keyword', settings: { foreground: keyword } },
                        ...(functionColor ? [{
                            scope: ['entity.name.function', 'support.function'],
                            settings: { foreground: functionColor }
                        }] : [])
                    ]
                }
            });
            try {
                const themedGrammar = await themedRegistry.loadGrammar(scope);
                for (const line of ['{{polca}}', 'C {{polca}} DE |', '%%template polca']) {
                    const tokens = themedGrammar.tokenizeLine2(line).tokens;
                    const colorAt = index => {
                        let metadata;
                        for (let i = 0; i < tokens.length && tokens[i] <= index; i += 2) metadata = tokens[i + 1];
                        assert.notEqual(metadata, undefined);
                        // TextMate stores the foreground color index in bits 15-23.
                        return themedRegistry.getColorMap()[(metadata >>> 15) & 0x1FF];
                    };
                    const color = colorAt(line.indexOf('polca'));
                    assert.equal(color, functionColor ?? keyword, line);
                    assert.notEqual(color, foreground, line);
                    if (line.includes('{{')) {
                        assert.equal(colorAt(line.indexOf('{{')), keyword, line);
                        assert.equal(colorAt(line.indexOf('}}')), keyword, line);
                    }
                }
            } finally { themedRegistry.dispose(); }
        }
    });
    test(`${scope}: literal text does not receive template highlighting`, () => {
        for (const line of [
            '% {{polca}}', '  % {{polca}}', 'C D | % {{polca}}',
            '"^{{polca}}" C D |', '[I:text {{polca}}] C D |',
            '%%text {{polca}}'
        ]) {
            assert.ok(!scopesAt(line, 'polca').some(scope => scope.includes('template')));
        }
        for (const line of ['{{bad/name}}', '{{unfinished', '%%templatex polca']) {
            assert.ok(!grammar.tokenizeLine(line).tokens.some(token => token.scopes.some(scope => scope.includes('template'))));
        }
    });
    test(`${scope}: multiline literal blocks preserve state and end before subsequent calls`, () => {
        for (const prefix of ['%%', 'I:']) {
            let state;
            for (const line of [`${prefix}begintext`, '{{polca}}', '%%template literal', `${prefix}endtext`]) {
                const result = grammar.tokenizeLine(line, state);
                assert.ok(!result.tokens.some(token => token.scopes.some(scope => scope.includes('template'))));
                state = result.ruleStack;
            }
            const result = grammar.tokenizeLine('{{polca}}', state);
            assert.ok(result.tokens.some(token => token.scopes.includes('support.function.template.abc')));
        }
    });
    if (scope === 'source.abc') {
        test('ABC metadata and lyrics stay literal; template bodies retain ABC highlighting', () => {
            for (const line of ['T:{{polca}}', 'w:{{polca}}', 'W:{{polca}}']) {
                assert.ok(!scopesAt(line, 'polca').some(scope => scope.includes('template')));
            }
            let state;
            for (const [line, text, expected] of [
                ['%%template rhythm', 'rhythm', 'entity.name.function.template.abc'],
                ['%%MIDI gchord fzzz', '%%MIDI', 'storage'],
                ['M:2/4', 'M:', 'keyword'],
                ['% Comment', '% Comment', 'comment'],
                ['%%endtemplate', '%%endtemplate', 'keyword.control.template.abc'],
                ['"C"C {{rhythm}} DEF |]', 'rhythm', 'support.function.template.abc']
            ]) {
                const result = grammar.tokenizeLine(line, state);
                const index = line.indexOf(text);
                assert.ok(result.tokens.some(token => token.startIndex <= index && token.endIndex > index && token.scopes.includes(expected)));
                state = result.ruleStack;
            }
        });
    }
}
