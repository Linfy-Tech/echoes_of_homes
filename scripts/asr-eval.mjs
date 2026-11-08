#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function normalise(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('en')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

export function wer(reference, hypothesis) {
  const ref = normalise(reference).split(' ').filter(Boolean);
  const hyp = normalise(hypothesis).split(' ').filter(Boolean);
  return { errors: editDistance(ref, hyp), units: ref.length };
}

export function cer(reference, hypothesis) {
  const ref = [...normalise(reference).replace(/\s/gu, '')];
  const hyp = [...normalise(hypothesis).replace(/\s/gu, '')];
  return { errors: editDistance(ref, hyp), units: ref.length };
}

function ratio(errors, units) {
  return units === 0 ? (errors === 0 ? 0 : 1) : errors / units;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function bootstrap(recordResults, metric, iterations = 1000, seed = 42) {
  if (recordResults.length === 0) return null;
  const random = seededRandom(seed);
  const values = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let errors = 0;
    let units = 0;
    for (let sample = 0; sample < recordResults.length; sample += 1) {
      const item = recordResults[Math.floor(random() * recordResults.length)];
      errors += item[metric].errors;
      units += item[metric].units;
    }
    values.push(ratio(errors, units));
  }
  values.sort((a, b) => a - b);
  return { low: values[Math.floor(iterations * 0.025)], high: values[Math.floor(iterations * 0.975)] };
}

export function evaluate(manifest) {
  if (!Array.isArray(manifest.references) || !Array.isArray(manifest.candidates)) {
    throw new Error('manifest must contain references[] and candidates[]');
  }
  const references = new Map(manifest.references.map((item) => [item.sampleId, item.text]));
  return manifest.candidates.map((candidate) => {
    const results = candidate.outputs.map((output) => {
      if (!references.has(output.sampleId)) throw new Error(`missing reference for ${output.sampleId}`);
      const reference = references.get(output.sampleId);
      return {
        sampleId: output.sampleId,
        wer: wer(reference, output.text),
        cer: cer(reference, output.text),
        latencyMs: output.latencyMs ?? null,
        audioMinutes: output.audioMinutes ?? null,
      };
    });
    const werErrors = results.reduce((sum, item) => sum + item.wer.errors, 0);
    const werUnits = results.reduce((sum, item) => sum + item.wer.units, 0);
    const cerErrors = results.reduce((sum, item) => sum + item.cer.errors, 0);
    const cerUnits = results.reduce((sum, item) => sum + item.cer.units, 0);
    const audioMinutes = results.reduce((sum, item) => sum + (item.audioMinutes ?? 0), 0);
    const latencyValues = results.map((item) => item.latencyMs).filter((value) => value !== null);
    const costPerMinute = candidate.costUsdPerMinute ?? null;
    return {
      id: candidate.id,
      provider: candidate.provider,
      model: candidate.model,
      samples: results.length,
      wer: ratio(werErrors, werUnits),
      cer: ratio(cerErrors, cerUnits),
      werCi95: bootstrap(results, 'wer'),
      cerCi95: bootstrap(results, 'cer'),
      latencyMsMedian: latencyValues.length ? latencyValues.sort((a, b) => a - b)[Math.floor(latencyValues.length / 2)] : null,
      audioMinutes,
      costUsd: costPerMinute === null ? null : audioMinutes * costPerMinute,
      costUsdPerMinute: costPerMinute,
      measured: results.length > 0,
    };
  });
}

export function renderReport(manifest, results) {
  const lines = [
    `# Offline ASR evaluation — ${manifest.dataset?.version ?? 'unversioned'}`,
    '',
    '> This report is generated from the supplied manifest. It is benchmark evidence only when the manifest references the consented Echoes Eval Set; synthetic fixtures are pipeline tests, not language-quality evidence.',
    '',
    `Dataset: ${manifest.dataset?.description ?? 'not specified'}`,
    `Dataset hash: ${manifest.dataset?.sha256 ?? 'not recorded'}`,
    '',
    '| Candidate | Samples | CER | WER | Median latency (ms) | Audio min | Cost (USD) |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const result of results) {
    lines.push(`| ${result.id} (${result.provider}/${result.model}) | ${result.samples} | ${result.cer.toFixed(4)} | ${result.wer.toFixed(4)} | ${result.latencyMsMedian ?? '—'} | ${result.audioMinutes.toFixed(2)} | ${result.costUsd === null ? '—' : result.costUsd.toFixed(4)} |`);
  }
  lines.push('', 'Metrics use Unicode NFC, lowercase, punctuation/symbol removal, and whitespace collapse. CER removes whitespace after normalisation. Confidence intervals are recording-level bootstrap 95% intervals with seed 42 and 1,000 iterations.', '');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) throw new Error('usage: node scripts/asr-eval.mjs <manifest.json|--fixtures> [report.md]');
  const manifestPath = input === '--fixtures'
    ? resolve('tests/evaluation/fixtures/asr-synthetic.json')
    : resolve(input);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const results = evaluate(manifest);
  const report = renderReport(manifest, results);
  if (output) await writeFile(resolve(output), report);
  else process.stdout.write(report);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
