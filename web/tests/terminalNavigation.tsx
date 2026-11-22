import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeftNav } from '../features/editor/LeftNav';

const html = renderToStaticMarkup(<LeftNav activeTab="terminal" onTabChange={() => {}}
  onToggleFormat={() => {}} isFormatOpen={false} />);
const buttons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
assert.ok(buttons.at(-2)![2].includes('รูปแบบ'));
assert.ok(buttons.at(-1)![2].includes('🖥'));
assert.ok(buttons.at(-1)![2].includes('Terminal'));
assert.ok(buttons.at(-1)![1].includes('aria-current="page"'));
console.log('Terminal navigation: last menu, below Format, requested icon and active state passed');
