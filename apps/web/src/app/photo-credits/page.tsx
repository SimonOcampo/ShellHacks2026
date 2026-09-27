import type { Metadata } from "next";
import sources from "../../../public/images/cities/sources.json";

export const metadata: Metadata = {
  title: "City photo credits — ODDyssey",
  description: "Sources and licenses for ODDyssey city skyline photographs.",
};

export default function PhotoCredits() {
  return (
    <main className="photo-credits-page">
      <a href="/">← Back to ODDyssey</a>
      <h1>City photo credits</h1>
      <p>
        City imagery provides visual context only. It is not part of the
        screening score. Photos may be cropped to fit the layout.
      </p>
      <div className="photo-credits-list">
        {sources.assets.map((asset) => (
          <article key={asset.file}>
            <img src={`/images/cities/${asset.file}`} alt={`${asset.city} skyline`} />
            <div>
              <h2>{asset.city}</h2>
              <p>
                {asset.author || "Wikimedia Commons contributor"} ·{" "}
                {asset.license_url ? (
                  <a href={asset.license_url} target="_blank" rel="noreferrer">
                    {asset.license}
                  </a>
                ) : (
                  asset.license
                )}
              </p>
              <a href={asset.source_page} target="_blank" rel="noreferrer">
                View original on Wikimedia Commons ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
