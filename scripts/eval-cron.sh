#!/bin/bash
cd "$(dirname "$0")/.."
npx tsx eval/run.ts eval/datasets/e2e.json --e2e --space 00000000-0000-0000-0000-000000000001
