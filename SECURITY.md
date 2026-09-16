# Security Policy

## Supported versions

Security fixes are generally focused on the latest maintained MCPackage release and the active development branch.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a suspected security vulnerability.

Use GitHub's private vulnerability reporting feature for this repository when available. If private reporting is unavailable, contact the repository maintainer through the private contact method listed on the maintainer's GitHub profile.

When reporting, include:

- affected MCPackage version or commit
- affected command, module, or workflow
- reproduction steps or proof of concept
- impact and attack prerequisites
- relevant logs or stack traces, with secrets removed

Please allow reasonable time for investigation and remediation before publicly disclosing a vulnerability.

## Scope

Examples of security issues include:

- arbitrary code execution caused by MCPackage input handling
- unsafe archive or filesystem operations
- path traversal
- credential or secret exposure
- dependency or update mechanisms that can be abused to execute unintended code

Normal bugs, feature requests, and support questions should use the appropriate public issue template instead.
