# Changelog

All notable changes to the Local-First AI Software Engineering Operating System (SE-OS) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.2.1] - 2026-07-23

### Fixed
- **Native Memory Management**: Documented and verified native Tree-sitter C++ memory deallocation hooks under Node.js V8 garbage collection scopes, preventing native memory leaks during batch file parsing.
- **Context Duplication**: Implemented a nested symbol check in the Context Builder to filter out child methods/fields when their parent class, interface, or namespace is already included in the compile block, saving up to 60% of token context in large files.
- **VFS Path Normalization**: Replaced path.resolve with Node's `fs.realpathSync` in Virtual File System normalization, resolving symbolic links and casing mismatches to prevent stale cache entries.
- **Malformed Syntax Safety**: Integrated Tree-sitter `ERROR` node detection in the AST parsing loop. It now throws a `ValidationException` on malformed syntax to avoid extracting invalid slices.
- **TypeScript Method Overloads**: Improved AST parser to de-duplicate overloaded method signatures, prioritizing the implementation signature containing the function body block.

### Added
- Integration and unit tests covering `ValidationException` throws on syntax errors.
- Integration tests verifying de-duplication of overloaded method declarations.
- Integration tests checking the elimination of nested duplicate symbol context prints.
