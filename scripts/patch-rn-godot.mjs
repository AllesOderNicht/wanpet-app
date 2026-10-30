// react-native-godot 1.0.1 passes Unicode character counts to JSI's byte-length API.
// Keep this scoped patch until an upstream version fixes STRING and STRING_NAME.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const directory = new URL('../node_modules/@borndotcom/react-native-godot/', import.meta.url);
let packageInfo;
try { packageInfo = JSON.parse(await readFile(new URL('package.json', directory), 'utf8')); }
catch (error) { if (error.code === 'ENOENT') process.exit(0); throw error; }
assert.equal(packageInfo.version, '1.0.1', 'Reassess the Godot UTF-8 patch when upgrading');
const path = fileURLToPath(new URL('common/NativeGodotModule.cpp', directory));
const original = await readFile(path, 'utf8');
let source = original;
const patches = [
  [
    'jsi::String ret = jsi::String::createFromUtf8(rt, (uint8_t *)s.utf8().get_data(), s.length());',
    'const auto utf8 = s.utf8();\n\t\t\t\tjsi::String ret = jsi::String::createFromUtf8(rt, (const uint8_t *)utf8.get_data(), utf8.length());',
  ],
  [
    'return jsi::String::createFromUtf8(rt, sn.to_utf8_buffer().ptr(), sn.length());',
    'const auto utf8 = sn.to_utf8_buffer();\n\t\t\t\treturn jsi::String::createFromUtf8(rt, utf8.ptr(), utf8.size());',
  ],
];
for (const [before, after] of patches) {
  if (source.includes(after)) continue;
  assert.equal(source.split(before).length, 2, 'Unexpected upstream source; refusing ambiguous patch');
  source = source.replace(before, after);
}
if (source !== original) await writeFile(path, source);
console.log('Godot UTF-8 byte-length patch verified');
