{
  description = "Ruflo (claude-flow) - Enterprise AI agent orchestration for Claude Code";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = pkgsFor system;
          nodejs = pkgs.nodejs_22;
        in
        {
          default = self.packages.${system}.ruflo;

          ruflo = pkgs.buildNpmPackage {
            pname = "ruflo";
            version = "3.5.48";

            src = ./.;

            npmDepsHash = "sha256-7IfDjSOF5cdhy89I6YpIxdFrbFfh41kZEOZSAnH/R8o=";

            inherit nodejs;

            # Skip optional dependency install scripts (WASM/native modules that may fail)
            npmFlags = [ "--ignore-scripts" ];
            NODE_OPTIONS = "--max-old-space-size=4096";

            # Custom build: compile TypeScript for the CLI
            buildPhase = ''
              runHook preBuild

              # Build shared and swarm packages first (CLI references them)
              ${nodejs}/bin/npx tsc -p v3/@claude-flow/shared/tsconfig.json --skipLibCheck 2>&1 || true
              ${nodejs}/bin/npx tsc -p v3/@claude-flow/swarm/tsconfig.json --skipLibCheck 2>&1 || true

              # Build CLI package
              ${nodejs}/bin/npx tsc -p v3/@claude-flow/cli/tsconfig.json --skipLibCheck 2>&1 || true

              runHook postBuild
            '';

            # Don't use default npm pack + install, do manual install
            dontNpmInstall = true;

            installPhase = ''
              runHook preInstall

              # Copy the package to lib
              mkdir -p $out/lib/ruflo
              cp -r package.json bin v3 node_modules $out/lib/ruflo/

              # Create bin wrappers
              mkdir -p $out/bin
              makeWrapper ${nodejs}/bin/node $out/bin/claude-flow \
                --add-flags "$out/lib/ruflo/bin/cli.js"
              makeWrapper ${nodejs}/bin/node $out/bin/ruflo \
                --add-flags "$out/lib/ruflo/bin/cli.js"

              runHook postInstall
            '';

            nativeBuildInputs = [ pkgs.makeWrapper ];

            meta = with pkgs.lib; {
              description = "Enterprise AI agent orchestration for Claude Code";
              homepage = "https://github.com/ruvnet/claude-flow";
              license = licenses.mit;
              mainProgram = "claude-flow";
              platforms = supportedSystems;
            };
          };
        }
      );

      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs_22
              nodePackages.typescript
            ];
          };
        }
      );
    };
}
