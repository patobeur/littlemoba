const characters = require("./characters.js");
const skills = require("./skills.js");
const config = require("./config.js");
const { GAME_CONSTANTS } = require("./config.js");
const { updateUserLevel, updateUserStats } = require("../database.js");
const MinionManager = require("../minions/minion-manager.js");

class Game {
    constructor() {
        this.players = new Map();
        this.projectiles = [];
        this.nextId = 1;
        this.PROJECTILE_SPEED = GAME_CONSTANTS.PROJECTILE_SPEED;
        this.PROJECTILE_RANGE = GAME_CONSTANTS.PROJECTILE_RANGE;
        this.isGameOver = false; // Track if game has ended

        // Initialize minion manager
        this.minionManager = new MinionManager();

        // Initialize structures from config
        this.structures = {};
        if (config.structures) {
            for (const [key, str] of Object.entries(config.structures)) {
                this.structures[key] = {
                    ...str,
                    maxHp: str.hp, // Store max HP
                    isDead: false,
                    level: 1 // Base level starts at 1
                };
            }
        }
    }

    generateId() {
        return String(this.nextId++);
    }

    startGame() {
        this.minionManager.startGame();
        console.log("[Game] Game started, minion spawning initialized");
    }

    stopGame() {
        console.log("[Game] Stopping game, cleaning up...");
        this.isGameOver = true;
        this.minionManager.stopGame();
        this.players.clear();
        this.projectiles = [];
    }

    addPlayer(id, msg) {
        // Validate character
        let charName = msg.character || "Moumba";
        if (!characters.chars[charName]) {
            charName = "Moumba";
        }
        const charStats = characters.chars[charName];

        const faction = msg.faction || "blue";
        let spawn = config.locations.spawnTeamA;
        if (faction === "red") {
            spawn = config.locations.spawnTeamB;
        }

        // Random offset within spawn radius (w is diameter)
        const radius = (spawn.w || 5) / 2;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const spawnX = spawn.x + Math.cos(angle) * dist;
        const spawnZ = spawn.y + Math.sin(angle) * dist; // Config y is Z in 3D

        const levelIndex = Math.max(0, (msg.level || 1) - 1);
        const player = {
            id,
            name: (msg.name || `Joueur ${id}`).slice(0, 16),
            color: msg.color || "#4CAF50",
            character: charName,
            x: spawnX,
            y: 0.5,
            z: spawnZ,
            rotY: 0,
            health: Array.isArray(charStats.health) ? charStats.health[Math.min(levelIndex, charStats.health.length - 1)] : charStats.health,
            maxHealth: Array.isArray(charStats.health) ? charStats.health[Math.min(levelIndex, charStats.health.length - 1)] : charStats.health,
            mana: Array.isArray(charStats.mana) ? charStats.mana[Math.min(levelIndex, charStats.mana.length - 1)] : charStats.mana,
            maxMana: Array.isArray(charStats.mana) ? charStats.mana[Math.min(levelIndex, charStats.mana.length - 1)] : charStats.mana,
            faction: faction,
            level: msg.level || 1,
            xp: 0,
            sessionXp: 0,

            // Detailed Session Stats
            kills: 0,
            assists: 0,
            damageDealtToPlayers: 0,
            damageDealtToBase: 0,
            damageDealtToMinions: 0,
            minionsKilled: 0,
            damageHistory: [], // Array of { attackerId, timestamp }

            maxXp: 100,
            isDead: false,
            respawnTime: null,
            disconnected: false,
            ts: Date.now(),
        };
        this.players.set(id, player);
        return player;
    }

    updatePlayer(id, msg) {
        const p = this.players.get(id);
        if (!p) return;

        // Update position and rotation
        if (msg.x !== undefined) p.x = msg.x;
        if (msg.y !== undefined) p.y = msg.y;
        if (msg.z !== undefined) p.z = msg.z;
        if (msg.rotY !== undefined) p.rotY = msg.rotY;

        p.ts = Date.now();
        return p;
    }

    setPlayerDisconnected(id, disconnected) {
        const p = this.players.get(id);
        if (p) {
            p.disconnected = disconnected;
        }
    }

    getPlayers() {
        // Return object map for websocket
        const playersObj = {};
        for (const [id, p] of this.players) {
            playersObj[id] = p;
        }
        return playersObj;
    }

    getStructures() {
        return this.structures;
    }

    removePlayer(id) {
        // If game is in progress, mark as disconnected instead of checking status here
        // The room manager calls this. If player leaves, we can remove them.
        // But for gameplay consistency, maybe keep them as disconnected body?
        // For now, simple removal.
        const p = this.players.get(id);
        if (p) {
            p.disconnected = true;
            // return true to indicate player was in game
            return true;
        }
        return false;
    }

    update(dt) {
        const events = [];

        // Don't update if game is over
        if (this.isGameOver) return events;

        // Autonomous movement for disconnected players
        for (const p of this.players.values()) {
            if (p.disconnected) {
                const spawn = p.faction === "blue" ? config.locations.spawnTeamA : config.locations.spawnTeamB;
                const dx = spawn.x - p.x;
                const dz = spawn.y - p.z; // Note: config uses y for z in 2D representation usually, but let's check config.js. 
                // Config has x, y. In 3D game, y is up. So config y maps to z.

                const dist = Math.hypot(dx, dz);
                const speed = 3.5; // Same as player speed

                if (dist > 0.1) {
                    const move = speed * dt;
                    p.x += (dx / dist) * move;
                    p.z += (dz / dist) * move;
                    p.rotY = Math.atan2(dx, dz);
                    p.ts = Date.now();

                    events.push({
                        type: "server-player-move",
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        rotY: p.rotY
                    });
                }
            }
        }

        // Health and Mana Regeneration
        for (const p of this.players.values()) {
            const charStats = characters.chars[p.character];
            if (!charStats) continue;

            let updated = false;

            // Get level-based stat index
            const levelIndex = Math.max(0, (p.level || 1) - 1);

            // Health regeneration
            if (p.health < p.maxHealth) {
                const regenRate = Array.isArray(charStats.HealthRegeneration)
                    ? charStats.HealthRegeneration[Math.min(levelIndex, charStats.HealthRegeneration.length - 1)]
                    : charStats.HealthRegeneration;
                p.health += regenRate * dt;
                if (p.health > p.maxHealth) p.health = p.maxHealth;
                updated = true;
            }

            // Mana regeneration
            if (p.mana < p.maxMana) {
                const regenRate = Array.isArray(charStats.manaRegeneration)
                    ? charStats.manaRegeneration[Math.min(levelIndex, charStats.manaRegeneration.length - 1)]
                    : charStats.manaRegeneration;
                p.mana += regenRate * dt;
                if (p.mana > p.maxMana) p.mana = p.maxMana;
                updated = true;
            }

            // Broadcast regen updates
            if (updated) {
                events.push({
                    type: "player-regen",
                    id: p.id,
                    health: p.health,
                    maxHealth: p.maxHealth,
                    mana: p.mana,
                    maxMana: p.maxMana
                });
            }
        }

        // Update Minions
        const minionEvents = this.minionManager.update(dt, this.players, this.structures);
        events.push(...minionEvents);

        // Death and Respawn System
        const now = Date.now();
        for (const p of this.players.values()) {
            // Check for death
            if (!p.isDead && p.health < 1) {
                p.isDead = true;
                const respawnDelay = p.level * 5000; // 5 seconds per level
                p.respawnTime = now + respawnDelay;

                events.push({
                    type: "player-death",
                    id: p.id,
                    respawnTime: p.respawnTime
                });

                console.log(`[Game] Player ${p.id} died, respawn in ${respawnDelay / 1000}s`);

                // XP Gain for Attacker & Kill/Assist Logic
                if (p.lastAttackerId) {
                    const attacker = this.players.get(p.lastAttackerId);
                    if (attacker && attacker.faction !== p.faction) {
                        const xpGain = 50 * p.level;
                        this.addXpToPlayer(attacker.id, xpGain, events);

                        // Increment Kills
                        attacker.kills = (attacker.kills || 0) + 1;
                        console.log(`[Game] Player ${attacker.name} killed ${p.name} (Kills: ${attacker.kills})`);
                    }
                }

                // Assist Logic
                if (p.damageHistory && p.damageHistory.length > 0) {
                    const assistWindow = 10000; // 10 seconds
                    const validAssisters = new Set();
                    const now = Date.now();

                    p.damageHistory.forEach(record => {
                        if (now - record.timestamp <= assistWindow && record.attackerId !== p.lastAttackerId) {
                            const assister = this.players.get(record.attackerId);
                            if (assister && assister.faction !== p.faction) {
                                validAssisters.add(record.attackerId);
                            }
                        }
                    });

                    validAssisters.forEach(assisterId => {
                        const assister = this.players.get(assisterId);
                        if (assister) {
                            assister.assists = (assister.assists || 0) + 1;
                            console.log(`[Game] Player ${assister.name} assisted in killing ${p.name} (Assists: ${assister.assists})`);

                            // Optional: XP for assist? (e.g., 25 * p.level)
                            const xpGain = 25 * p.level;
                            this.addXpToPlayer(assister.id, xpGain, events);
                        }
                    });
                }
            }

            // Check for respawn
            if (p.isDead && p.respawnTime && now >= p.respawnTime) {
                // Calculate spawn position
                const spawn = p.faction === "blue" ? config.locations.spawnTeamA : config.locations.spawnTeamB;
                const radius = (spawn.w || 5) / 2;
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * radius;
                p.x = spawn.x + Math.cos(angle) * dist;
                p.z = spawn.y + Math.sin(angle) * dist;
                p.y = 0.5;

                // Reset health and state
                p.health = p.maxHealth;
                p.mana = p.maxMana;
                p.isDead = false;
                p.respawnTime = null;
                p.lastAttackerId = null; // Reset attacker
                p.damageHistory = []; // Clear damage history

                events.push({
                    type: "player-respawn",
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    z: p.z,
                    health: p.health,
                    maxHealth: p.maxHealth,
                    mana: p.mana,
                    maxMana: p.maxMana
                });

                console.log(`[Game] Player ${p.id} respawned at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const move = this.PROJECTILE_SPEED * dt;
            p.x += p.vx * move;
            p.z += p.vz * move;
            p.distTraveled += move;

            // Check if shooter is a player or minion
            let shooter = this.players.get(p.shooterId);
            let shooterIsMinion = false;

            if (!shooter) {
                // Check if shooter is a minion
                shooter = this.minionManager.getMinionById(p.shooterId);
                if (shooter) {
                    shooterIsMinion = true;
                } else {
                    // Shooter doesn't exist anymore, remove projectile
                    this.projectiles.splice(i, 1);
                    continue;
                }
            }

            // Collision Detection
            let hit = false;

            // 1. Check Player Collision
            for (const [id, player] of this.players) {
                if (id === p.shooterId || player.isDead || player.faction === shooter.faction) continue; // Don't hit self, dead, or friendly players

                const dx = p.x - player.x;
                const dz = p.z - player.z;
                // Simple radius check (0.5)
                if (Math.hypot(dx, dz) < 0.5) {
                    hit = true;

                    // Apply Damage based on shooter type
                    let damage = 10;
                    if (shooterIsMinion) {
                        const minionsData = require("./minions.js");
                        const minionStats = minionsData.chars[shooter.name];
                        damage = minionStats ? minionStats.autoAttackDamage[0] : 10;
                    } else {
                        const charStats = characters.chars[shooter.character];
                        damage = charStats ? charStats.autoAttackDamage[0] : 10;

                        // Update player damage stats
                        const shooterPlayer = this.players.get(p.shooterId);
                        if (shooterPlayer) {
                            shooterPlayer.damageDealtToPlayers = (shooterPlayer.damageDealtToPlayers || 0) + damage;

                            // Add to target's damage history for assists
                            player.damageHistory.push({
                                attackerId: p.shooterId,
                                timestamp: Date.now()
                            });
                        }
                    }

                    player.health -= damage;
                    player.lastAttackerId = p.shooterId; // Track attacker
                    if (player.health < 0) player.health = 0;

                    events.push({
                        type: "hit",
                        shooterId: p.shooterId,
                        shooterType: shooterIsMinion ? "minion" : "player",
                        targetId: id,
                        targetType: "player",
                        damage,
                        targetHealth: player.health,
                        targetMaxHealth: player.maxHealth
                    });
                    break;
                }
            }

            // 2. Check Minion Collision (if not hit player)
            if (!hit) {
                const minions = this.minionManager.getMinions();
                for (const minion of minions) {
                    if (minion.id === p.shooterId || minion.isDead || minion.faction === shooter.faction) continue;

                    const dx = p.x - minion.x;
                    const dz = p.z - minion.z;
                    if (Math.hypot(dx, dz) < 0.5) {
                        hit = true;

                        // Apply Damage based on shooter type
                        let damage = 10;
                        if (shooterIsMinion) {
                            const minionsData = require("./minions.js");
                            const minionStats = minionsData.chars[shooter.name];
                            damage = minionStats ? minionStats.autoAttackDamage[0] : 10;
                        } else {
                            const charStats = characters.chars[shooter.character];
                            damage = charStats ? charStats.autoAttackDamage[0] : 10;

                            // Update minion damage stats
                            const shooterPlayer = this.players.get(p.shooterId);
                            if (shooterPlayer) {
                                shooterPlayer.damageDealtToMinions = (shooterPlayer.damageDealtToMinions || 0) + damage;
                            }
                        }

                        const damageResult = this.minionManager.damageMinion(minion.id, damage, p.shooterId);

                        if (damageResult) {
                            events.push({
                                type: "minion-hit",
                                shooterId: p.shooterId,
                                shooterType: shooterIsMinion ? "minion" : "player",
                                targetId: minion.id,
                                targetType: "minion",
                                damage,
                                targetHealth: damageResult.health,
                                targetMaxHealth: damageResult.maxHealth,
                                isDead: damageResult.isDead
                            });

                            // If minion died, clean up its projectiles and give XP to killer
                            if (damageResult.isDead) {
                                this.minionManager.cleanupMinionProjectiles(minion.id, this.projectiles);

                                // Give XP to killer if it's a player
                                if (!shooterIsMinion) {
                                    // Track minion kill
                                    const shooterPlayer = this.players.get(p.shooterId);
                                    if (shooterPlayer) {
                                        shooterPlayer.minionsKilled = (shooterPlayer.minionsKilled || 0) + 1;
                                    }
                                    console.log(`[Game Debug] Minion ${minion.id} killed by player ${p.shooterId}. Checking XP logic...`);
                                    try {
                                        const minionsData = require("./minions.js");
                                        // xpRewardedPerLv is at the root of minionsData

                                        if (minionsData.xpRewardedPerLv) {
                                            // Level 1 minion gives index 0 reward
                                            const minionLevel = minion.level || 1;
                                            const rewardIndex = Math.min(minionLevel - 1, minionsData.xpRewardedPerLv.length - 1);
                                            const xpReward = minionsData.xpRewardedPerLv[Math.max(0, rewardIndex)];

                                            console.log(`[Game Debug] Minion Level: ${minionLevel}, RewardIndex: ${rewardIndex}, XP Reward: ${xpReward}`);

                                            this.addXpToPlayer(p.shooterId, xpReward, events);
                                        } else {
                                            console.error("[Game Debug] xpRewardedPerLv not found in minions.js");
                                        }
                                    } catch (err) {
                                        console.error("[Game Debug] Error in XP logic:", err);
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }

            // 3. Check Structure Collision (if not hit player or minion)
            if (!hit) {
                for (const [key, str] of Object.entries(this.structures)) {
                    if (str.isDead) continue;

                    // Check faction (don't hit friendly bases)
                    let isFriendly = false;
                    if (shooter.faction === "blue" && key === "BaseTeamA") isFriendly = true;
                    if (shooter.faction === "red" && key === "BaseTeamB") isFriendly = true;

                    if (isFriendly) continue;

                    const dx = p.x - str.x;
                    const dz = p.z - str.y; // Config y is Z in 3D
                    const radius = str.collisionRadius || 4; // Default to 4 if not set

                    if (Math.hypot(dx, dz) < radius) {
                        hit = true;

                        // Apply Damage based on shooter type
                        let damage = 10;
                        if (shooterIsMinion) {
                            const minionsData = require("./minions.js");
                            const minionStats = minionsData.chars[shooter.name];
                            damage = minionStats ? minionStats.autoAttackDamage[0] : 10;
                        } else {
                            const charStats = characters.chars[shooter.character];
                            damage = charStats ? charStats.autoAttackDamage[0] : 10;

                            // Update base damage stats
                            const shooterPlayer = this.players.get(p.shooterId);
                            if (shooterPlayer) {
                                if (key === "BaseTeamA" || key === "BaseTeamB") {
                                    shooterPlayer.damageDealtToBase = (shooterPlayer.damageDealtToBase || 0) + damage;
                                }
                            }
                        }

                        str.hp -= damage;
                        if (str.hp <= 0) {
                            str.hp = 0;
                            if (!str.isDead) {
                                str.isDead = true;
                                console.log(`[Game] Structure ${key} destroyed!`);
                                events.push({
                                    type: "structure-death",
                                    structureId: key,
                                    killerId: shooter.id
                                });

                                // Check if a base was destroyed (game over)
                                if (key === "BaseTeamA" || key === "BaseTeamB") {
                                    const winningTeam = key === "BaseTeamA" ? "red" : "blue";
                                    console.log(`[Game] Base ${key} destroyed! Team ${winningTeam} wins!`);

                                    // Mark game as over
                                    this.isGameOver = true;

                                    // Collect all player data for victory screen
                                    const playersList = Array.from(this.players.values()).map(p => ({
                                        id: p.id,
                                        name: p.name,
                                        character: p.character,
                                        level: p.level,
                                        faction: p.faction,
                                        kills: p.kills || 0,
                                        assists: p.assists || 0,
                                        damageDealtToPlayers: p.damageDealtToPlayers || 0,
                                        damageDealtToBase: p.damageDealtToBase || 0,
                                        damageDealtToMinions: p.damageDealtToMinions || 0,
                                        minionsKilled: p.minionsKilled || 0
                                    }));

                                    // Update stats for all players
                                    for (const p of this.players.values()) {
                                        if (p.statsUpdated) continue;

                                        const isWinner = p.faction === winningTeam;
                                        updateUserStats(p.id, {
                                            played: 1,
                                            won: isWinner ? 1 : 0,
                                            lost: isWinner ? 0 : 1,
                                            xp: p.sessionXp || 0,
                                            kills: p.kills || 0,
                                            assists: p.assists || 0,
                                            damagePlayers: p.damageDealtToPlayers || 0,
                                            damageBase: p.damageDealtToBase || 0,
                                            damageMinions: p.damageDealtToMinions || 0,
                                            minionsKilled: p.minionsKilled || 0
                                        }).then(() => {
                                            console.log(`[Game] Stats updated for player ${p.name}`);
                                        }).catch(err => {
                                            console.error(`[Game] Failed to update stats for player ${p.name}:`, err);
                                        });

                                        p.statsUpdated = true;
                                    }

                                    // Create game-over event
                                    events.push({
                                        type: "game-over",
                                        winningTeam: winningTeam,
                                        players: playersList
                                    });
                                }
                            }
                        }

                        events.push({
                            type: "structure-hit",
                            structureId: key,
                            damage,
                            hp: str.hp,
                            maxHp: str.maxHp,
                            shooterId: shooter.id,
                            shooterType: shooterIsMinion ? "minion" : "player"
                        });
                        break;
                    }
                }
            }

            if (hit || p.distTraveled >= this.PROJECTILE_RANGE) {
                this.projectiles.splice(i, 1);
            }
        }
        return events;
    }

    addXpToPlayer(playerId, xpGain, events) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.xp += xpGain;
        player.sessionXp = (player.sessionXp || 0) + xpGain;
        console.log(`[Game] Player ${player.id} gained ${xpGain} XP`);

        // Check Level Up
        let leveledUp = false;
        while (player.xp >= player.maxXp) {
            player.xp -= player.maxXp;
            player.level++;
            leveledUp = true;
            player.maxXp = player.level * 100;
            player.health = player.maxHealth; // Full heal on level up
            player.mana = player.maxMana;
            console.log(`[Game] Player ${player.id} leveled up to ${player.level}!`);
        }

        if (leveledUp) {
            updateUserLevel(player.id, player.level)
                .then(() => console.log(`[Database] Level for user ${player.id} updated to ${player.level}.`))
                .catch(err => console.error(`[Database] Error updating level for user ${player.id}:`, err));

            events.push({
                type: "level-up",
                id: player.id,
                level: player.level,
            });

            // Check Base Level Up
            const baseKey = player.faction === "blue" ? "BaseTeamA" : "BaseTeamB";
            const base = this.structures[baseKey];
            if (base && !base.isDead && base.level < 18 && player.level > base.level) {
                base.level = Math.min(player.level, 18);
                console.log(`[Game] ${baseKey} leveled up to ${base.level}!`);
            }
        }

        events.push({
            type: "player-xp",
            id: player.id,
            xp: player.xp,
            maxXp: player.maxXp,
            level: player.level
        });
    }

    addProjectile(shooterId, x, y, z, angle) {
        const shooter = this.players.get(shooterId);
        if (shooter && shooter.isDead) return; // Prevent shooting if dead

        let vx = Math.sin(angle);
        let vz = Math.cos(angle);

        this.projectiles.push({
            shooterId,
            x,
            z,
            vx,
            vz,
            distTraveled: 0
        });
    }
}

module.exports = Game;
