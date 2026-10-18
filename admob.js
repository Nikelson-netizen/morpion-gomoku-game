// Gomoku - AdMob Android
(function () {
  const capacitor = window.Capacitor;

  console.log("[AdMob DIAGNOSTIC]", {
  capacitorPresent: Boolean(capacitor),
  native: capacitor?.isNativePlatform?.(),
  platform: capacitor?.getPlatform?.(),
  pluginPresent: Boolean(capacitor?.Plugins?.AdMob)
});

  const isAndroidApp =
    capacitor?.isNativePlatform?.() === true &&
    capacitor?.getPlatform?.() === "android";

  const admob = isAndroidApp
    ? capacitor.Plugins?.AdMob
    : null;

    const isIOSApp =
  Boolean(
    window.webkit?.messageHandlers?.admobInterstitial
  );

  window.GomokuAds = {
    available: Boolean(admob) || isIOSApp,
ready: isIOSApp,

    interstitialReady: isIOSApp,

  testAdId: "ca-app-pub-3940256099942544/1033173712",

  productionAdId: "ca-app-pub-1324909808984599/9759639125",

  async prepareTestInterstitial() {
    if (!this.ready || !admob) return false;

    try {
      await admob.prepareInterstitial({
       adId: this.productionAdId,
       isTesting: false
      });

      this.interstitialReady = true;
      console.log("[AdMob] Publicité de test chargée");
      return true;

    } catch (error) {
      this.interstitialReady = false;
      console.error("[AdMob] Chargement impossible :", error);
      return false;
    }
  },

  async showTestInterstitial() {
    if (isIOSApp) {
  window.webkit.messageHandlers
    .admobInterstitial
    .postMessage("show");

  console.log(
    "[AdMob iOS] Affichage demandé"
  );

  return true;
}
  if (!admob || !this.ready || !this.interstitialReady) {
    console.log("[AdMob] Aucune annonce prête");
    return false;
  }

  this.interstitialReady = false;

  try {
    await admob.showInterstitial({
     adId: this.productionAdId
    });

    console.log("[AdMob] Affichage demandé");
    return true;

  } catch (error) {
    console.error("[AdMob] Erreur d'affichage :", error);
    await this.prepareTestInterstitial();
    return false;
  }
},

    async initialize() {
      if (isIOSApp) {
  this.ready = true;
  console.log("[AdMob iOS] Pont natif disponible");
  return true;
}
      if (!admob) {
        console.log("[AdMob] Plugin natif indisponible");
        return false;
      }

      try {
        let consent = await admob.requestConsentInfo();

        if (
          consent.status === "REQUIRED" &&
          consent.isConsentFormAvailable
        ) {
          consent = await admob.showConsentForm();
        }

        if (!consent.canRequestAds) {
          console.log("[AdMob] Annonces non autorisées");
          return false;
        }

        await admob.initialize();

        await admob.addListener("interstitialAdDismissed", () => {
  console.log("[AdMob] Annonce fermée");
  void this.prepareTestInterstitial();
});

        this.ready = true;
console.log("[AdMob] Initialisation réussie");

await this.prepareTestInterstitial();

return true;

      } catch (error) {
        console.error("[AdMob] Erreur :", error);
        return false;
      }
    }
  };

  window.GomokuAds.initialize();
})();