class Devcode < Formula
  desc "Free-first, any-model AI coding assistant for the terminal"
  homepage "https://github.com/Harsha-code-per/DeV"
  version "@VERSION@"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Harsha-code-per/DeV/releases/download/v@VERSION@/devcode-darwin-arm64.tar.gz"
      sha256 "@SHA256:devcode-darwin-arm64.tar.gz@"
    end
    on_intel do
      url "https://github.com/Harsha-code-per/DeV/releases/download/v@VERSION@/devcode-darwin-x64.tar.gz"
      sha256 "@SHA256:devcode-darwin-x64.tar.gz@"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/Harsha-code-per/DeV/releases/download/v@VERSION@/devcode-linux-arm64.tar.gz"
      sha256 "@SHA256:devcode-linux-arm64.tar.gz@"
    end
    on_intel do
      url "https://github.com/Harsha-code-per/DeV/releases/download/v@VERSION@/devcode-linux-x64.tar.gz"
      sha256 "@SHA256:devcode-linux-x64.tar.gz@"
    end
  end

  def install
    # Keep the files that ship beside the binary (such as vendor/) next to it.
    libexec.install Dir["*"]
    bin.install_symlink libexec/"devcode"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/devcode --version")
  end
end
