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

    _interstitialClosePromise: null,
_resolveInterstitialClose: null,

_createInterstitialClosePromise() {
  if (this._interstitialClosePromise) {
    return this._interstitialClosePromise;
  }

  this._interstitialClosePromise =
    new Promise((resolve) => {
      this._resolveInterstitialClose =
        resolve;
    });

  return this._interstitialClosePromise;
},

_finishInterstitialWait(result = true) {
  const resolve =
    this._resolveInterstitialClose;

  this._resolveInterstitialClose = null;
  this._interstitialClosePromise = null;

  if (resolve) {
    resolve(result);
  }
},

_notifyInterstitialClosed() {
  console.log(
    "[AdMob] Annonce réellement fermée"
  );

  this._finishInterstitialWait(true);

  window.dispatchEvent(
    new Event(
      "gomokuInterstitialClosed"
    )
  );
},

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

  /*
   * Créer AVANT l'affichage une promesse
   * qui ne sera terminée qu'à la fermeture
   * réelle de l'annonce.
   */
  const closePromise =
    this._createInterstitialClosePromise();

  /*
   * =========================
   * iOS
   * =========================
   */
  if (isIOSApp) {
    try {
      window.webkit.messageHandlers
        .admobInterstitial
        .postMessage("show");

      console.log(
        "[AdMob iOS] Affichage demandé — attente fermeture"
      );

      const closed =
        await closePromise;

      return closed;

    } catch (error) {
      console.error(
        "[AdMob iOS] Erreur :",
        error
      );

      this._finishInterstitialWait(
        false
      );

      return false;
    }
  }

  /*
   * =========================
   * Android
   * =========================
   */
  if (
    !admob ||
    !this.ready ||
    !this.interstitialReady
  ) {
    console.log(
      "[AdMob] Aucune annonce prête"
    );

    this._finishInterstitialWait(
      false
    );

    return false;
  }

  this.interstitialReady = false;

  try {
    await admob.showInterstitial({
      adId: this.productionAdId
    });

    console.log(
      "[AdMob] Affichage demandé — attente fermeture"
    );

    /*
     * IMPORTANT :
     * on attend interstitialAdDismissed.
     */
    const closed =
      await closePromise;

    return closed;

  } catch (error) {
    console.error(
      "[AdMob] Erreur d'affichage :",
      error
    );

    this._finishInterstitialWait(
      false
    );

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

        await admob.addListener(
  "interstitialAdDismissed",
  () => {

    /*
     * C'est ICI que l'annonce Android
     * est réellement fermée.
     */
    this._notifyInterstitialClosed();

    void this.prepareTestInterstitial();
  }
);

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

  window.gomokuIOSInterstitialDismissed =
  function () {

    console.log(
      "[AdMob iOS] Annonce fermée"
    );

    window.GomokuAds
      ?._notifyInterstitialClosed();
  };

  window.GomokuAds.initialize();
})();