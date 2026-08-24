// ===============================
// GOMOKU ADMIN
// ===============================

const socket = io();

const adminLoginSection =
  document.getElementById(
    "adminLoginSection"
  );

const adminControls =
  document.getElementById(
    "adminControls"
  );

const adminPasswordInput =
  document.getElementById(
    "adminPassword"
  );

const adminLoginBtn =
  document.getElementById(
    "adminLoginBtn"
  );

const tournamentCodeInput =
  document.getElementById(
    "adminTournamentCode"
  );

const closeTournamentBtn =
  document.getElementById(
    "adminCloseTournamentBtn"
  );

const resetChallengeBtn =
  document.getElementById(
    "adminResetChallengeBtn"
  );

const adminStatus =
  document.getElementById(
    "adminStatus"
  );


// ===============================
// SOCKET CONNECTION
// ===============================

socket.on("connect", () => {
  console.log(
    "✅ Admin connected:",
    socket.id
  );

  if (adminStatus) {
    adminStatus.textContent =
      "✅ Connected to server.";
  }
});

socket.on("disconnect", () => {
  if (adminStatus) {
    adminStatus.textContent =
      "⚠️ Server disconnected.";
  }
});

// ===============================
// ADMIN LOGIN
// ===============================

if (adminLoginBtn) {
  adminLoginBtn.addEventListener(
    "click",
    () => {

      const password =
        adminPasswordInput?.value || "";

      if (!password) {
        adminStatus.textContent =
          "⚠️ Enter the admin password.";
        return;
      }

      if (!socket.connected) {
        adminStatus.textContent =
          "⚠️ Server not connected.";
        return;
      }

      adminLoginBtn.disabled = true;

      adminStatus.textContent =
        "⏳ Checking admin access...";

      socket.emit(
        "adminLogin",
        {
          password
        }
      );
    }
  );
}

socket.on(
  "adminLoginSuccess",
  () => {

    if (adminLoginSection) {
      adminLoginSection.style.display =
        "none";
    }

    if (adminControls) {
      adminControls.style.display =
        "block";
    }

    if (adminPasswordInput) {
      adminPasswordInput.value = "";
    }

    adminStatus.textContent =
      "✅ Admin access granted.";
  }
);


// ===============================
// CLOSE TOURNAMENT
// ===============================

if (closeTournamentBtn) {
  closeTournamentBtn.addEventListener(
    "click",
    () => {

      const code =
        tournamentCodeInput?.value
          .trim()
          .toUpperCase() || "";

      if (!code) {
        adminStatus.textContent =
          "⚠️ Enter a tournament code.";
        return;
      }

      if (
        !socket ||
        !socket.connected
      ) {
        adminStatus.textContent =
          "⚠️ Server not connected.";
        return;
      }

      const confirmed =
        window.confirm(
          `Close tournament ${code}?`
        );

      if (!confirmed) {
        return;
      }

      closeTournamentBtn.disabled =
        true;

      closeTournamentBtn.textContent =
        "Closing...";

      adminStatus.textContent =
        `⏳ Closing tournament ${code}...`;

      socket.emit(
        "adminCloseTournament",
        {
          code
        }
      );
    }
  );
}


// ===============================
// RESET CHALLENGE DATA
// ===============================

if (resetChallengeBtn) {
  resetChallengeBtn.addEventListener(
    "click",
    () => {

      if (
        !socket ||
        !socket.connected
      ) {
        adminStatus.textContent =
          "⚠️ Server not connected.";
        return;
      }

      const confirmed =
        window.confirm(
          "Reset all Challenge data?"
        );

      if (!confirmed) {
        return;
      }

      resetChallengeBtn.disabled =
        true;

      resetChallengeBtn.textContent =
        "Resetting...";

      adminStatus.textContent =
        "⏳ Resetting Challenge data...";

      socket.emit(
        "adminResetChallengeData"
      );
    }
  );
}


// ===============================
// SERVER RESPONSES
// ===============================

socket.on(
  "adminTournamentClosed",
  ({ code, message }) => {

    if (adminStatus) {
      adminStatus.textContent =
        message ||
        `✅ Tournament ${code} closed.`;
    }

    if (closeTournamentBtn) {
      closeTournamentBtn.disabled =
        false;

      closeTournamentBtn.textContent =
        "🏁 Close Tournament";
    }

    if (tournamentCodeInput) {
      tournamentCodeInput.value = "";
    }
  }
);


socket.on(
  "adminChallengeReset",
  ({ message } = {}) => {

    if (adminStatus) {
      adminStatus.textContent =
        message ||
        "✅ Challenge data reset.";
    }

    if (resetChallengeBtn) {
      resetChallengeBtn.disabled =
        false;

      resetChallengeBtn.textContent =
        "🔄 Reset Challenge Data";
    }
  }
);


// ===============================
// ADMIN ERROR
// ===============================

socket.on(
  "adminError",
  ({ message } = {}) => {

    if (adminLoginBtn) {
  adminLoginBtn.disabled = false;
}

    if (adminStatus) {
      adminStatus.textContent =
        `❌ ${message || "Admin error."}`;
    }

    if (closeTournamentBtn) {
      closeTournamentBtn.disabled =
        false;

      closeTournamentBtn.textContent =
        "🏁 Close Tournament";
    }

    if (resetChallengeBtn) {
      resetChallengeBtn.disabled =
        false;

      resetChallengeBtn.textContent =
        "🔄 Reset Challenge Data";
    }
  }
);