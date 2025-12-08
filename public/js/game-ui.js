export function initGameUI(onModeChange) {
	// Inject In-Game Options Modal
	const modal = document.createElement("div");
	modal.id = "options-modal";
	modal.hidden = true;
	modal.innerHTML = `
		<div id="options-content">
			<h2>Options</h2>
            
            <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #26324a;">
                <button id="quitGameBtn" style="width:100%; padding:10px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">
                    Quitter la partie
                </button>
            </div>

			<label>Mode de déplacement</label>
			<select id="modalMoveMode" style="width:100%; padding:8px; background:#0e1523; color:#eaeefb; border:1px solid #26324a; border-radius:4px;">
				<option value="keyboard">Clavier (Flèches)</option>
				<option value="mouse">Souris (Cliquer pour bouger)</option>
			</select>
			<button class="close-btn" id="closeOptions">Fermer</button>
		</div>
	`;
	document.body.appendChild(modal);

	const modalMoveModeSelect = document.getElementById("modalMoveMode");
	const closeOptionsBtn = document.getElementById("closeOptions");
	const quitBtn = document.getElementById("quitGameBtn");

	if (quitBtn) {
		quitBtn.onclick = async () => {
			const urlParams = new URLSearchParams(window.location.search);
			const roomId = urlParams.get("roomId");
			if (roomId) {
				try {
					await fetch(`/api/rooms/${roomId}/leave`, { method: "POST" });
				} catch (e) {
					console.error("Error leaving room:", e);
				}
			}
			window.location.href = "lobby.html";
		};
	}

	function loadProfile() {
		try {
			return JSON.parse(localStorage.getItem("topdown_profile") || "null");
		} catch {
			return null;
		}
	}

	function saveProfile(p) {
		localStorage.setItem("topdown_profile", JSON.stringify(p));
	}

	// Load initial mode
	const currentProfile = loadProfile();
	if (currentProfile && currentProfile.mode) {
		modalMoveModeSelect.value = currentProfile.mode;
		// Notify main immediately about the stored mode
		if (onModeChange) onModeChange(currentProfile.mode);
	}

	// Modal Logic
	function toggleModal() {
		modal.hidden = !modal.hidden;
	}

	addEventListener("keydown", (e) => {
		if (e.key.toLowerCase() === "h" || e.key === "Escape") {
			toggleModal();
		}
	});

	closeOptionsBtn.addEventListener("click", () => {
		modal.hidden = true;
	});

	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			modal.hidden = true;
		}
	});

	// Update mode when changed in modal
	modalMoveModeSelect.addEventListener("change", () => {
		const current = loadProfile() || {};
		current.mode = modalMoveModeSelect.value;
		saveProfile(current);

		if (onModeChange) {
			onModeChange(current.mode);
		}
	});

	return {
		toggle: toggleModal,
		updatePlayerInfo: (
			name,
			level,
			health,
			maxHealth,
			mana,
			maxMana,
			xp,
			maxXp,
			charStats = null
		) => {
			const nameEl = document.getElementById("player-name");
			const levelEl = document.getElementById("player-level");
			const xpBar = document.getElementById("bar-xp");
			const hpBar = document.getElementById("bar-hp");
			const mpBar = document.getElementById("bar-mp");

			if (nameEl) nameEl.textContent = name;
			if (levelEl) levelEl.textContent = `Niveau ${level}`;

			if (xpBar)
				xpBar.style.width = `${Math.min(
					100,
					Math.max(0, (xp / maxXp) * 100)
				)}%`;
			if (hpBar)
				hpBar.style.width = `${Math.min(
					100,
					Math.max(0, (health / maxHealth) * 100)
				)}%`;
			if (mpBar)
				mpBar.style.width = `${Math.min(
					100,
					Math.max(0, (mana / maxMana) * 100)
				)}%`;

			// Update character stats if provided
			if (charStats) {
				const statType = document.getElementById("stat-type");
				const statSpeed = document.getElementById("stat-speed");
				const statRange = document.getElementById("stat-range");
				const statAtk = document.getElementById("stat-atk");
				const statAtkCd = document.getElementById("stat-atkcd");
				const statHpRegen = document.getElementById("stat-hpregen");
				const statMpRegen = document.getElementById("stat-mpregen");
				const statPhysArmor = document.getElementById("stat-physarmor");
				const statMagArmor = document.getElementById("stat-magarmor");

				const levelIndex = Math.max(0, level - 1);

				if (statType) statType.textContent = charStats.type || "-";
				if (statSpeed) {
					statSpeed.textContent = Array.isArray(charStats.speed)
						? charStats.speed[
						Math.min(levelIndex, charStats.speed.length - 1)
						]
						: charStats.speed || "-";
				}
				if (statRange) {
					statRange.textContent = Array.isArray(charStats.hitDistance)
						? charStats.hitDistance[
						Math.min(levelIndex, charStats.hitDistance.length - 1)
						]
						: charStats.hitDistance || "-";
				}

				// Arrays: autoAttackDamage, autoAttackCd, HealthRegeneration, manaRegeneration, physiqueArmor, magicArmor
				if (statAtk) {
					statAtk.textContent = Array.isArray(charStats.autoAttackDamage)
						? charStats.autoAttackDamage[
						Math.min(
							levelIndex,
							charStats.autoAttackDamage.length - 1
						)
						]
						: charStats.autoAttackDamage || "-";
				}
				if (statAtkCd) {
					statAtkCd.textContent = Array.isArray(charStats.autoAttackCd)
						? charStats.autoAttackCd[
						Math.min(levelIndex, charStats.autoAttackCd.length - 1)
						]
						: charStats.autoAttackCd || "-";
				}
				if (statHpRegen) {
					statHpRegen.textContent = Array.isArray(
						charStats.HealthRegeneration
					)
						? charStats.HealthRegeneration[
						Math.min(
							levelIndex,
							charStats.HealthRegeneration.length - 1
						)
						]
						: charStats.HealthRegeneration || "-";
				}
				if (statMpRegen) {
					statMpRegen.textContent = Array.isArray(
						charStats.manaRegeneration
					)
						? charStats.manaRegeneration[
						Math.min(
							levelIndex,
							charStats.manaRegeneration.length - 1
						)
						]
						: charStats.manaRegeneration || "-";
				}
				if (statPhysArmor) {
					statPhysArmor.textContent = Array.isArray(
						charStats.physiqueArmor
					)
						? charStats.physiqueArmor[
						Math.min(levelIndex, charStats.physiqueArmor.length - 1)
						]
						: charStats.physiqueArmor || "-";
				}
				if (statMagArmor) {
					statMagArmor.textContent = Array.isArray(charStats.magicArmor)
						? charStats.magicArmor[
						Math.min(levelIndex, charStats.magicArmor.length - 1)
						]
						: charStats.magicArmor || "-";
				}
			}
		},
		showRespawnTimer: (seconds) => {
			let timerEl = document.getElementById("respawn-timer");
			if (!timerEl) {
				timerEl = document.createElement("div");
				timerEl.id = "respawn-timer";
				timerEl.style.cssText =
					"position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:#ff4444; padding:15px 25px; border-radius:8px; font-size:24px; font-weight:bold; border:2px solid #ff4444;";
				document.body.appendChild(timerEl);
			}
			timerEl.textContent = `Respawn dans ${seconds}s`;
			timerEl.hidden = false;
		},
		hideRespawnTimer: () => {
			const timerEl = document.getElementById("respawn-timer");
			if (timerEl) {
				timerEl.hidden = true;
			}
		},
		showVictoryModal: (winningTeam, players) => {
			// Create victory modal
			let victoryModal = document.getElementById("victory-modal");
			if (!victoryModal) {
				victoryModal = document.createElement("div");
				victoryModal.id = "victory-modal";
				victoryModal.style.cssText =
					"position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:10000;";
				document.body.appendChild(victoryModal);
			}

			const teamName = winningTeam === "blue" ? "Bleue" : "Rouge";
			const teamColor = winningTeam === "blue" ? "#4A90E2" : "#E74C3C";

			// Separate players by team
			const bluePlayers = players.filter((p) => p.faction === "blue");
			const redPlayers = players.filter((p) => p.faction === "red");

			victoryModal.innerHTML = `
                <div style="background:#0B1020; padding:40px; border-radius:12px; max-width:700px; width:90%; border:3px solid ${teamColor}; box-shadow:0 0 30px ${teamColor};">
                    <h1 style="text-align:center; color:${teamColor}; font-size:48px; margin:0 0 30px 0; text-shadow:0 0 20px ${teamColor};">
                        Victoire - Équipe ${teamName} !
                    </h1>
                    
                    <div style="display:flex; flex-direction:column; gap:20px; margin-bottom:30px; overflow-y:auto; max-height:60vh;">
                        <!-- Blue Team -->
                        <div style="background:#0D1527; padding:15px; border-radius:8px; border:2px solid #4A90E2;">
                            <h3 style="color:#4A90E2; margin:0 0 10px 0; font-size:18px; text-align:center;">Équipe Bleue</h3>
                            <table style="width:100%; border-collapse:collapse; color:#eaeefb; font-size:12px;">
                                <thead style="background:#0B1020; color:#888;">
                                    <tr>
                                        <th style="padding:5px; text-align:left;">Joueur</th>
                                        <th style="padding:5px;">K</th>
                                        <th style="padding:5px;">A</th>
                                        <th style="padding:5px;">Dmg (P)</th>
                                        <th style="padding:5px;">Dmg (B)</th>
                                        <th style="padding:5px;">Dmg (M)</th>
                                        <th style="padding:5px;">CS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${bluePlayers
					.map(
						(p) => `
                                        <tr style="border-bottom:1px solid #26324a;">
                                            <td style="padding:5px; text-align:left;">
                                                <div style="font-weight:bold;">${p.name}</div>
                                                <div style="font-size:10px; color:#888;">${p.character} (Lvl ${p.level})</div>
                                            </td>
                                            <td style="padding:5px; text-align:center;">${p.kills}</td>
                                            <td style="padding:5px; text-align:center;">${p.assists}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToPlayers}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToBase}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToMinions}</td>
                                            <td style="padding:5px; text-align:center;">${p.minionsKilled}</td>
                                        </tr>
                                    `
					)
					.join("")}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Red Team -->
                        <div style="background:#0D1527; padding:15px; border-radius:8px; border:2px solid #E74C3C;">
                            <h3 style="color:#E74C3C; margin:0 0 10px 0; font-size:18px; text-align:center;">Équipe Rouge</h3>
                           <table style="width:100%; border-collapse:collapse; color:#eaeefb; font-size:12px;">
                                <thead style="background:#0B1020; color:#888;">
                                    <tr>
                                        <th style="padding:5px; text-align:left;">Joueur</th>
                                        <th style="padding:5px;">K</th>
                                        <th style="padding:5px;">A</th>
                                        <th style="padding:5px;">Dmg (P)</th>
                                        <th style="padding:5px;">Dmg (B)</th>
                                        <th style="padding:5px;">Dmg (M)</th>
                                        <th style="padding:5px;">CS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${redPlayers
					.map(
						(p) => `
                                        <tr style="border-bottom:1px solid #26324a;">
                                            <td style="padding:5px; text-align:left;">
                                                <div style="font-weight:bold;">${p.name}</div>
                                                <div style="font-size:10px; color:#888;">${p.character} (Lvl ${p.level})</div>
                                            </td>
                                            <td style="padding:5px; text-align:center;">${p.kills}</td>
                                            <td style="padding:5px; text-align:center;">${p.assists}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToPlayers}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToBase}</td>
                                            <td style="padding:5px; text-align:center;">${p.damageDealtToMinions}</td>
                                            <td style="padding:5px; text-align:center;">${p.minionsKilled}</td>
                                        </tr>
                                    `
					)
					.join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <button id="return-lobby-btn" style="width:100%; padding:15px; background:#4CAF50; color:white; border:none; border-radius:8px; font-size:18px; font-weight:bold; cursor:pointer;">
                        Retour au Lobby (<span id="countdown">5</span>s)
                    </button>
                </div>
            `;

			// Auto-redirect timer
			let countdown = 60;
			const countdownEl = document.getElementById("countdown");
			const returnBtn = document.getElementById("return-lobby-btn");

			const timer = setInterval(() => {
				countdown--;
				if (countdownEl) countdownEl.textContent = countdown;

				if (countdown <= 0) {
					clearInterval(timer);
					redirectToLobby();
				}
			}, 1000);

			// Manual redirect on button click
			if (returnBtn) {
				returnBtn.onclick = () => {
					clearInterval(timer);
					redirectToLobby();
				};
			}

			async function redirectToLobby() {
				const urlParams = new URLSearchParams(window.location.search);
				const roomId = urlParams.get("roomId");
				if (roomId) {
					try {
						await fetch(`/api/rooms/${roomId}/leave`, { method: "POST" });
					} catch (e) {
						console.error("Error leaving room:", e);
					}
				}
				window.location.href = "lobby.html";
			}
		},
	};
}
