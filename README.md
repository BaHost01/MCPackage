# MC Bedrock CLI

A modern Node.js CLI tool for managing, auditing, and compiling Minecraft Bedrock Edition addons.

## Features

- **Audit**: Scans your project structure and creates a `.mc-audit.json` file to track assets.
- **Compile**: Packages your behavior and resource packs into a `.mcaddon` file.
- **Config**: Interactively edit your project's `mc-config.json`.
- **Update**: update your manifests to the latest bedrock version.
- **Experimental**: Easily enable experimental flags in your manifests.

## Installation

```bash
npm install -g .
```

## Usage

### Commands

- `mc init`: Initialize a new project structure and configuration.
- `mc audit [dir]`: Audit the current directory (or specified one).
- `mc compile`: Compile the project into an `.mcaddon` file.
- `mc config`: Edit the project configuration.
- `mc experimental`: Enable experimental API features.
- `mc update`: Update project manifests to the latest engine version.
- `mc list`: List tracked files from the audit.

### Workflow

1.  **Initialize/Config**: Run `mc config` to set up your project details.
2.  **Develop**: Create your `behavior_pack` and `resource_pack` folders.
3.  **Audit**: Run `mc audit` to index your files.
4.  **Compile**: Run `mc compile` to build the addon.

## Configuration

The `mc-config.json` file stores metadata about your addon:

```json
{
  "name": "My Addon",
  "version": "1.0.0",
  "minEngineVersion": "1.21.0",
  "author": "You"
}
```
