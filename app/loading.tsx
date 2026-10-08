import { ArrowIcon, GithubIcon, PrinterIcon } from "@/components/Icons";

export default function Loading() {
  return (
    <>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Git Receipts home"><span className="logo-icon"><PrinterIcon size={21} /></span>Git Receipts<span className="version-tag">GR–02</span></a>
        <nav aria-label="Main navigation"><a href="/#about">About the data <ArrowIcon size={13} /></a><a className="github-nav" href="https://github.com" target="_blank" rel="noreferrer"><GithubIcon size={17} />GitHub<ArrowIcon diagonal size={12} /></a></nav>
      </header>
    <main className="loading-shell" aria-busy="true">
      <div className="loading-workspace">
        <div className="loading-configuration">
          <p className="loading-status" role="status">Loading your GitHub year…</p>
          <div aria-hidden="true">
            <div className="skeleton skeleton-heading" />
            <div className="skeleton skeleton-heading short" />
            <div className="skeleton skeleton-copy" />
            <div className="skeleton skeleton-copy short" />
            <div className="skeleton skeleton-input" />
            <div className="skeleton skeleton-button" />
            <div className="skeleton skeleton-metrics" />
          </div>
        </div>
        <div className="skeleton-studio" aria-hidden="true"><div className="skeleton skeleton-paper" /><div className="skeleton skeleton-printer" /></div>
      </div>
    </main>
    </>
  );
}
