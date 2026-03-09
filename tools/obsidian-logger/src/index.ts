#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import os from 'os';
import { readTranscript, findTranscripts, findProjectTranscripts } from './parser/jsonl-reader.js';
import { extractReasoningChain } from './parser/reasoning-chain.js';
import { generateMarkdown } from './markdown/generator.js';
import { generateFilename } from './markdown/templates.js';
import { ObsidianClient, saveToLocal } from './obsidian/api-client.js';
import { loadConfig, saveConfig, isSessionSynced, markSessionSynced } from './config.js';

const program = new Command();

program
  .name('obsidian-logger')
  .description('Log Claude Code agent reasoning chains to Obsidian vault')
  .version('0.1.0');

// sync command
program
  .command('sync')
  .description('Sync Claude Code sessions to Obsidian vault')
  .option('-s, --session <id>', 'Sync a specific session by ID')
  .option('-p, --project <name>', 'Sync all sessions for a project')
  .option('-r, --recent <n>', 'Sync the N most recent sessions', '1')
  .option('-f, --force', 'Force sync even if already synced')
  .option('--dry-run', 'Preview what would be synced without writing')
  .option('--local <dir>', 'Save to local directory instead of Obsidian API')
  .action(async (opts) => {
    const config = loadConfig();
    const projectsDir = config.claudeProjectsDir.replace('~', os.homedir());

    // Find transcripts based on options
    let transcriptFiles: string[] = [];

    if (opts.session) {
      // Find by session ID in filename
      const all = findTranscripts(projectsDir);
      transcriptFiles = all.filter(f => path.basename(f).includes(opts.session));
    } else if (opts.project) {
      transcriptFiles = findProjectTranscripts(projectsDir, opts.project);
    } else {
      transcriptFiles = findTranscripts(projectsDir);
    }

    // Limit to recent N
    const recent = parseInt(opts.recent, 10) || 1;
    if (!opts.session && !opts.project) {
      transcriptFiles = transcriptFiles.slice(0, recent);
    }

    if (transcriptFiles.length === 0) {
      console.log('No transcript files found.');
      return;
    }

    console.log(`Found ${transcriptFiles.length} transcript(s) to process.`);

    // Initialize Obsidian client (or local fallback)
    let obsidianClient: ObsidianClient | null = null;
    let localDir: string | null = null;

    if (opts.local) {
      localDir = path.resolve(opts.local);
      console.log(`Saving to local directory: ${localDir}`);
    } else {
      obsidianClient = new ObsidianClient(config.obsidian);
      const available = await obsidianClient.isAvailable();
      if (!available) {
        localDir = path.join(os.homedir(), 'obsidian-logger-output');
        console.log(`Obsidian REST API not available. Falling back to local: ${localDir}`);
        obsidianClient = null;
      } else {
        console.log('Connected to Obsidian REST API.');
      }
    }

    let synced = 0;
    let skipped = 0;

    for (const file of transcriptFiles) {
      const entries = await readTranscript(file);
      if (entries.length === 0) {
        console.log(`  Skipping empty transcript: ${path.basename(file)}`);
        skipped++;
        continue;
      }

      const sessionId = entries[0].sessionId;

      // Check if already synced
      if (!opts.force && isSessionSynced(sessionId)) {
        console.log(`  Already synced: ${sessionId.slice(0, 8)}...`);
        skipped++;
        continue;
      }

      // Extract reasoning chain
      const chain = extractReasoningChain(entries);
      const markdown = generateMarkdown(chain);
      const filename = generateFilename(chain);

      if (opts.dryRun) {
        console.log(`  [dry-run] Would sync: ${filename}`);
        console.log(`    Session: ${sessionId.slice(0, 8)}...`);
        console.log(`    Project: ${chain.project}`);
        console.log(`    Steps: ${chain.steps.length}`);
        console.log(`    Tools: ${chain.toolsUsed.join(', ')}`);
        synced++;
        continue;
      }

      // Write to Obsidian or local
      const vaultPath = `${config.obsidian.vaultPath}/${filename}`;

      try {
        if (obsidianClient) {
          const exists = await obsidianClient.noteExists(vaultPath);
          if (exists && !opts.force) {
            console.log(`  Note already exists: ${vaultPath}`);
            skipped++;
            continue;
          }
          await obsidianClient.createNote(vaultPath, markdown);
          console.log(`  Synced to Obsidian: ${vaultPath}`);
        } else if (localDir) {
          const localPath = path.join(localDir, filename);
          await saveToLocal(localPath, markdown);
          console.log(`  Saved locally: ${localPath}`);
        }

        markSessionSynced(sessionId);
        synced++;
      } catch (err) {
        console.error(`  Error syncing ${sessionId.slice(0, 8)}...: ${err}`);
      }
    }

    console.log(`\nDone. Synced: ${synced}, Skipped: ${skipped}`);
  });

// config command
program
  .command('config')
  .description('Configure obsidian-logger settings')
  .option('--api-url <url>', 'Obsidian REST API URL')
  .option('--api-key <key>', 'Obsidian REST API key')
  .option('--vault-path <path>', 'Path within vault for notes (e.g. "AI Sessions")')
  .option('--projects-dir <dir>', 'Claude projects directory')
  .option('--show', 'Show current configuration')
  .action((opts) => {
    const config = loadConfig();

    if (opts.show) {
      console.log('Current configuration:');
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    let changed = false;

    if (opts.apiUrl) {
      config.obsidian.apiUrl = opts.apiUrl;
      changed = true;
    }
    if (opts.apiKey) {
      config.obsidian.apiKey = opts.apiKey;
      changed = true;
    }
    if (opts.vaultPath) {
      config.obsidian.vaultPath = opts.vaultPath;
      changed = true;
    }
    if (opts.projectsDir) {
      config.claudeProjectsDir = opts.projectsDir;
      changed = true;
    }

    if (changed) {
      saveConfig(config);
      console.log('Configuration saved.');
    } else {
      console.log('No changes specified. Use --show to see current config.');
    }
  });

// test command - quick test with a specific JSONL file
program
  .command('test')
  .description('Test parsing a JSONL file and preview the Markdown output')
  .argument('<file>', 'Path to JSONL transcript file')
  .action(async (file: string) => {
    const filePath = path.resolve(file);
    console.log(`Parsing: ${filePath}`);

    const entries = await readTranscript(filePath);
    console.log(`Entries: ${entries.length}`);

    if (entries.length === 0) {
      console.log('No entries found.');
      return;
    }

    const chain = extractReasoningChain(entries);
    console.log(`\nSession: ${chain.sessionId.slice(0, 8)}...`);
    console.log(`Project: ${chain.project}`);
    console.log(`Model: ${chain.model}`);
    console.log(`Steps: ${chain.steps.length}`);
    console.log(`Tools: ${chain.toolsUsed.join(', ')}`);
    console.log(`Filename: ${generateFilename(chain)}`);
    console.log('\n--- Markdown Preview ---\n');

    const markdown = generateMarkdown(chain);
    console.log(markdown);
  });

program.parse();
