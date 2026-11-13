// The PTM logo at the top of every email, linking to the public home page

/** e.g. https://ptm.themoirs.uk → https://ptm.themoirs.uk/home/ */
export function homePageUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/home/`;
}

export function emailLogo(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `<p style="margin:0 0 16px"><a href="${homePageUrl(base)}" title="PTM home page"><img src="${base}/ptm-logo.png?v=4" alt="PTM" width="56" height="56" style="display:block;width:56px;height:56px;border:0;border-radius:10px"></a></p>`;
}
