const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const path = require("path");

const DB_PATH = path.join(__dirname, "data/users.db");
const saltRounds = 10;

let db = new sqlite3.Database(DB_PATH, (err) => {
	if (err) {
		console.error("Could not connect to database", err);
	} else {
		console.log("Connected to SQLite database.");
		db.run(
			`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            level INTEGER DEFAULT 1
        )`,
			(err) => {
				if (err) {
					console.error("Could not create table", err);
				} else {
					console.log("Users table created or already exists.");

					const os = require("os");
					const interfaces = os.networkInterfaces();
					const port = process.env.PORT || 8080;
					let serverUrl = `http://localhost:${port}`;
					let addresses = [];

					for (const name of Object.keys(interfaces)) {
						for (const iface of interfaces[name]) {
							if (iface.family === "IPv4" && !iface.internal) {
								addresses.push(iface.address);
							}
						}
					}

					if (addresses.length > 0) {
						serverUrl = `http://${addresses[0]}:${port}`;
						console.log(`Server is online at: ${serverUrl}`);
						if (addresses.length > 1) {
							console.log(
								`Other available IPs: ${addresses.slice(1).join(", ")}`
							);
						}
					} else {
						console.log(`Server is online at: ${serverUrl}`);
					}
				}
			}
		);
	}
});

async function createUser(username, email, password) {
	const hashedPassword = await bcrypt.hash(password, saltRounds);
	return new Promise((resolve, reject) => {
		db.run(
			`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
			[username, email, hashedPassword],
			function (err) {
				if (err) {
					if (err.message.includes("UNIQUE constraint failed")) {
						reject(new Error("Username or email already exists."));
					} else {
						reject(err);
					}
				} else {
					resolve({ id: this.lastID, username, email });
				}
			}
		);
	});
}

function findUserByUsername(username) {
	return new Promise((resolve, reject) => {
		db.get(
			`SELECT * FROM users WHERE username = ?`,
			[username],
			(err, row) => {
				if (err) {
					reject(err);
				} else {
					resolve(row);
				}
			}
		);
	});
}

module.exports = {
	db,
	createUser,
	findUserByUsername,
	bcrypt,
	updateUserLevel,
};

function updateUserLevel(userId, newLevel) {
	return new Promise((resolve, reject) => {
		db.run(
			`UPDATE users SET level = ? WHERE id = ?`,
			[newLevel, userId],
			function (err) {
				if (err) {
					reject(err);
				} else if (this.changes === 0) {
					reject(new Error("User not found."));
				} else {
					resolve({ id: userId, level: newLevel });
				}
			}
		);
	});
}
