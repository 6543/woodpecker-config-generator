{
  description = "Woodpecker CI interactive configuration generator - local dev environment";

  # Pinned to an explicit nixpkgs revision so evaluation is reproducible and
  # fetching goes through codeload tarballs rather than the rate-limited GitHub API.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/e7a3ca8092b61ff85b6a45bf863ea2b2d6a661b3";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default =
          let
            # Node 24 matches the upstream Woodpecker frontend; package.json
            # requires node >=22 and pins pnpm 11 via the packageManager field.
            node = pkgs.nodejs_24;

            # The GOOS=js GOARCH=wasm build in
            # packages/pipeline-wasm/scripts/build-wasm.sh needs at least the Go
            # version the upstream go.mod declares (go 1.26.0, spec appendix A /
            # §10.4). brotli is used there to measure transfer size.
            go = pkgs.go_1_26;
          in
          pkgs.mkShell {
            packages = [
              node
              pkgs.pnpm
              go
              pkgs.brotli
              pkgs.git
              pkgs.cacert # TLS roots for `go` module fetches and the schema curl
            ];

            # Keep the toolchain fixed to the pinned go; never download one.
            env.GOTOOLCHAIN = "local";

            shellHook = ''
              echo "woodpecker-config-generator dev shell"
              echo "  node $(node --version)  pnpm $(pnpm --version)  $(go version | awk '{print $1, $3}')"
              echo ""
              echo "  pnpm install        install workspace dependencies"
              echo "  pnpm dev            start the Vite dev server (apps/generator)"
              echo "  pnpm check          format:check + lint + typecheck + test"
              echo ""
              echo "The WASM engine builds from the in-repo Go module in"
              echo "packages/pipeline-wasm/wasm (imports go.woodpecker-ci.org/woodpecker/v3),"
              echo "so no upstream checkout is needed. It is lazy-loaded, so the dev server"
              echo "runs without it:"
              echo "  pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm"
            '';
          };
      });

      # `nix run .#dev` - install deps and start the Vite dev server in one step.
      # Run from the repository root.
      apps = forAllSystems (pkgs: {
        dev = {
          type = "app";
          program =
            let
              runner = pkgs.writeShellApplication {
                name = "wp-gen-dev";
                runtimeInputs = [
                  pkgs.nodejs_24
                  pkgs.pnpm
                  pkgs.go_1_26
                  pkgs.brotli
                  pkgs.git
                ];
                text = ''
                  pnpm install --frozen-lockfile
                  exec pnpm dev "$@"
                '';
              };
            in
            "${runner}/bin/wp-gen-dev";
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
