"use strict";
//Based, in part, on code from http://tchow.com/games/card-w2016/card

//gl stuff based in part on the MDN webgl tutorials:
// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context
//and also based on the 15-466-f18 notes:
// http://graphics.cs.cmu.edu/courses/15-466-f18/notes/gl-helpers.js

const PLAYER_HEIGHT = 0.7;
const PLAYER_WIDTH = 0.6;

const GRAVITY = 30.0;
const JUMP = 6.0;
const JUMP_TIME = 0.5;
const SPEED = 4.0;

const TICK = 1.0 / 60.0;

const GAME = {
	width:0,
	height:0,
	tiles:[ ], //width x height
	player:{
		x:0.5,
		y:1.0,
		vx:0.0,
		vy:0.0,
	}
};

GAME.setLevel = function GAME_setLevel(LEVEL) {
	const map = LEVEL.map;
	this.width = 0;
	this.height = map.length;
	map.forEach(function(row){
		this.width = Math.max(this.width, row.length);
	}, this);
	this.tiles = new Array(this.width * this.height);

	let start = {x:0, y:0};

	for (let y = 0; y < this.height; ++y) {
		for (let x = 0; x < this.width; ++x) {
			const mapRow = map[this.height-1-y];
			const tile = { fg:null, bg:null };
			this.tiles[y*this.width+x] = tile;

			let t = (x < mapRow.length ? mapRow[x] : ".");
			//special case start:
			if (t === 's') {
				t = '.';
				start.x = x;
				start.y = y;
			}
			if (t === 'O') {
				tile.bg = TILES.tree;
			} else if (t === 'A') {
				tile.bg = TILES.cone;
			} else if (t === 'e') {
				tile.bg = TILES.exit;
			} else if (t === '#') {
				tile.fg = TILES.solid;
			//futures:
			} else if (t === '0') { //require a tree
				tile.requires = TILES.tree;
				tile.isFuture = true;
			} else if (t === '4') { //require a cone
				tile.requires = TILES.cone;
				tile.isFuture = true;
			} else if (t === ',') {
				tile.isFuture = true;
			} else {
				if (t !== '.') {
					console.log("Unhandled tile background '" + t + "' treated as empty.");
				}
			}
		}
	}

	this.player = {
		x:start.x + 0.5,
		y:start.y + 1e-3,
		vx:0.0,
		vy:0.0,
		jumps:0
	};

	this.camera = {
		radius:4.0,
		x:this.player.x,
		y:this.player.y
	};
	
	this.futureMode = false;

};

GAME.isSolid = function GAME_isSolid(x,y) {
	if (this.futureMode) {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
		if (!this.tiles[y * this.width + x].isRemembered) return true;
		if (this.tiles[y * this.width + x].isFuture) return true;
		return this.tiles[y * this.width + x].fg !== null;
	} else {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
		return this.tiles[y * this.width + x].fg !== null;
	}
};

//corners are CCW, so inside is left of boundary
function Convex() {
	this.corners = new Array(...arguments);
};

//returns hit time (1.0 if no collision)
Convex.prototype.vsRay = function Convex_vsRay(origin, direction) {
	let originInside = true;
	let hit = 1.0;

	for (let i = 0; i < this.corners.length; i += 2) {
		const a = {
			x:this.corners[i],
			y:this.corners[i+1]
		};
		const b = {
			x:this.corners[(i+2)%this.corners.length],
			y:this.corners[(i+2)%this.corners.length+1]
		};

		const perp = {
			x:-(b.y-a.y),
			y:b.x-a.x
		};

		const op = perp.x*(origin.x-a.x)+perp.y*(origin.y-a.y);
		const dp = perp.x*(direction.x-a.x)+perp.y*(direction.y-a.y);

		if (op > 0) continue; //skip: origin is inside
		originInside = false;

		if (dp <= 0) continue; //skip: destination is outside

		//op <= 0, dp > 0 --> ray crosses into this edge
		const t = (0.0 - op) / (dp - op);

		if (t > hit) continue;

		const along = (origin.x + t*direction.x - a.x) * (b.x - a.x)
		            + (origin.y + t*direction.y - a.y) * (b.y - a.y);

		//misses the edge:
		if (along < 0.0 || along > (b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y)) continue;

		hit = t;
	}

	if (originInside) return 0.0;
	else return hit;
};


//returns {x:, y:, dis2:} of closest point:
Convex.prototype.closestPoint = function Convex_closestPoint(c) {
	let isInside = true;

	let closeX = NaN;
	let closeY = NaN;
	let closeDis2 = Infinity;
	let closeOutX = NaN;
	let closeOutY = NaN;

	for (let i = 0; i < this.corners.length; i += 2) {
		const a = {
			x:this.corners[i],
			y:this.corners[i+1]
		};
		const b = {
			x:this.corners[(i+2)%this.corners.length],
			y:this.corners[(i+2)%this.corners.length+1]
		};

		const perp = {
			x:-(b.y-a.y),
			y:b.x-a.x
		};

		const cp = perp.x*(c.x-a.x)+perp.y*(c.y-a.y);
		if (cp <= 0.0) isInside = false;

		let along = (c.x - a.x) * (b.x - a.x)
		          + (c.y - a.y) * (b.y - a.y);

		const len2 = (b.x-a.x)*(b.x-a.x)+(b.y-a.y)*(b.y-a.y);

		along = Math.min(len2, Math.max(0.0, along)) / len2;

		const pt = {
			x:along*(b.x-a.x)+a.x,
			y:along*(b.y-a.y)+a.y
		};

		const dis2 = (pt.x-c.x)*(pt.x-c.x)+(pt.y-c.y)*(pt.y-c.y);

		if (dis2 < closeDis2) {
			closeX = pt.x;
			closeY = pt.y;
			closeOutX = -perp.x;
			closeOutY = -perp.y;
			closeDis2 = dis2;
		}
	}
	if (isInside) {
		closeX = c.x;
		closeY = c.y;
		closeDis2 = 0.0;
	}
	return {x:closeX, y:closeY, ox:closeOutX, oy:closeOutY, dis2:closeDis2};
};

//build the collision convex polygons in player configuration space:
// (sx,sy) => player step assuming max movement
// padding => extra size
GAME.buildCollision = function GAME_buildCollision(sx,sy,padding) {
	sx = sx || 0.0;
	sy = sy || 0.0;
	padding = padding || 0.0;

	let convexes = [];

	let minTileX = Math.floor(this.player.x - 0.5 * PLAYER_WIDTH + Math.min(0.0, sx) - padding);
	let maxTileX = Math.floor(this.player.x + 0.5 * PLAYER_WIDTH + Math.max(0.0, sx) + padding);
	let minTileY = Math.floor(this.player.y + Math.min(0.0, sy) - padding);
	let maxTileY = Math.floor(this.player.y + PLAYER_HEIGHT + Math.max(0.0, sy) + padding);

	minTileX = Math.max(minTileX, 0);
	maxTileX = Math.min(maxTileX, this.width-1);
	minTileY = Math.max(minTileY, 0);
	maxTileY = Math.min(maxTileY, this.height-1);

	for (let y = minTileY; y <= maxTileY; ++y) {
		for (let x = minTileX; x <= maxTileX; ++x) {
			const tile = this.tiles[y * this.width + x];
			if (!tile.fg) continue;
			//solid tile excludes step from certain area:
			const minX = x - 0.5 * PLAYER_WIDTH - this.player.x;
			const maxX = x + 1.0 + 0.5 * PLAYER_WIDTH - this.player.x;
			const minY = y - PLAYER_HEIGHT - this.player.y;
			const maxY = y + 1.0 - this.player.y;

			convexes.push(new Convex(
				minX,minY,
				maxX,minY,
				maxX,maxY,
				minX,maxY
			));
		}
	}
	return convexes;
};

//some discrete directions for various circular ray sweeps:
const DIRECTIONS = new Array(16);
for (let i = 0; i < DIRECTIONS.length; ++i) {
	let a = i / DIRECTIONS.length * 2.0 * Math.PI;
	DIRECTIONS[i] = {
		x:Math.cos(a),
		y:Math.sin(a)
	};
}

GAME.movePlayer = function GAME_movePlayer(controls) {
	if (this.player.dead) return;

	this.player.vy -= GRAVITY * TICK;
	if (controls.up.downs && this.player.jumps > 0) {
		this.player.jumpping = JUMP_TIME;
		this.player.jumps -= 1;
		this.player.vy = JUMP;
	}
	if (this.player.jumpping) {
		this.player.jumpping -= TICK;
		if (this.player.jumpping < 0.0 || !controls.up.pressed) {
			delete this.player.jumpping;
		} else {
			this.player.vy += 0.5 * GRAVITY * TICK;
		}
	}

	if (controls.left.pressed && controls.right.pressed) {
		this.player.vx = 0.0;
	} else if (controls.left.pressed) {
		this.player.vx = Math.max(-SPEED, this.player.vx + -SPEED / 0.1 * TICK);
	} else if (controls.right.pressed) {
		this.player.vx = Math.min(SPEED, this.player.vx + SPEED / 0.1 * TICK);
	} else {
		//this.player.vx *= Math.pow(0.5, TICK / 0.25);
		this.player.vx = Math.sign(this.player.vx) * Math.max(
			0.0,
			Math.abs(this.player.vx) - SPEED / 0.1 * TICK
		);
	}

	{ //simple(est) version:
		const EPS = 1e-3;

		//resolve horizontal movement:
		{
			let ix = Math.floor(this.player.x);
			let iy = Math.floor(this.player.y + 0.5 * PLAYER_HEIGHT);

			let solidLeft = this.isSolid(ix-1,iy);
			let solidRight = this.isSolid(ix+1,iy);
			if (this.player.y - iy < 0.0) {
				solidLeft = solidLeft || this.isSolid(ix-1,iy-1);
				solidRight = solidRight || this.isSolid(ix+1,iy-1);
			}
			if (this.player.y - iy > 1.0 - PLAYER_HEIGHT) {
				solidLeft = solidLeft || this.isSolid(ix-1,iy+1);
				solidRight = solidRight || this.isSolid(ix+1,iy+1);
			}

			this.player.x += this.player.vx * TICK;

			if (solidLeft && this.player.x - ix < 0.5 * PLAYER_WIDTH) {
				this.player.x = ix + 0.5 * PLAYER_WIDTH + EPS;
				this.player.vx = 0.0; //0.5 * Math.abs(this.player.vx);
			}

			if (solidRight && this.player.x - ix > 1.0 - 0.5 * PLAYER_WIDTH) {
				this.player.x = ix + 1.0 - 0.5 * PLAYER_WIDTH - EPS;
				this.player.vx = 0.0; //0.5 *-Math.abs(this.player.vx);
			}
		}

		//resolve vertical movement:
		{
			let ix = Math.floor(this.player.x);
			let iy = Math.floor(this.player.y + 0.5 * PLAYER_HEIGHT);

			let solidDown = this.isSolid(ix,iy-1);
			let solidUp = this.isSolid(ix,iy+1);
			if (this.player.x - ix < 0.5 * PLAYER_WIDTH) {
				solidDown = solidDown || this.isSolid(ix-1,iy-1);
				solidUp = solidUp || this.isSolid(ix-1,iy+1);
			}
			if (this.player.x - ix > 1.0 - 0.5 * PLAYER_WIDTH) {
				solidDown = solidDown || this.isSolid(ix+1,iy-1);
				solidUp = solidUp || this.isSolid(ix+1,iy+1);
			}

			this.player.y += this.player.vy * TICK;

			if (solidDown && this.player.y - iy < 0.0) {
				this.player.y = iy + EPS;
				this.player.vy = 0.0; //0.5 * Math.abs(this.player.vy);
				this.player.jumps = 1;
			}

			if (solidUp && this.player.y - iy > 1.0 - PLAYER_HEIGHT) {
				this.player.y = iy + 1.0 - PLAYER_HEIGHT - EPS;
				this.player.vy = 0.0; //0.5 *-Math.abs(this.player.vy);
			}
		}
	}

	if (this.player.y < -2.0 && this.player.vy < 0.0) this.player.dead = true;

};

GAME.startFuture = function GAME_startFuture(x,y) {
	this.tiles.forEach(function(tile){
		delete tile.marked;
		delete tile.matchOffset;
	});

	//flood-fill the future & mark:
	let future = [{x:x, y:y}];
	this.tiles[y*this.width+x].marked = true;
	for (let i = 0; i < future.length; ++i) {
		let at = future[i];
		console.assert(this.tiles[at.y*this.width+at.x].marked, "all future marked");
		[{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}].forEach(function(s){
			let n = { x:at.x+s.x, y:at.y+s.y };
			if (n.x < 0 || n.y < 0 || n.x >= this.width || n.y >= this.height) return;
			if (!this.tiles[n.y*this.width+n.x].isFuture) return;
			if (this.tiles[n.y*this.width+n.x].marked) return;
			this.tiles[n.y*this.width+n.x].marked = true;
			future.push(n);
		}, this);
	}

	let required = [];
	future.forEach(function(at){
		let tile = this.tiles[at.y*this.width+at.x];
		if (tile.requires) {
			required.push({x:at.x, y:at.y, requires:tile.requires});
		}
	}, this);
	console.log("Future has " + future.length + " tiles, and " + required.length + " requirements.");
	console.assert(required.length > 0, "must have something required");

	//look for requirements:
	this.tiles.forEach(function(tile, tileIndex){
		if (tile.bg !== required[0].requires) return;
		if (!tile.isRemembered) return;

		let at = {
			x:(tileIndex % this.width),
			y:Math.floor(tileIndex / this.width)
		};
		for (let i = 1; i < required.length; ++i) {
			let n = {
				x: at.x + required[i].x - required[0].x,
				y: at.y + required[i].y - required[0].y
			};
			if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) {
				return; //bail out -- nothing here to match
			}
			let ntile = this.tiles[n.y * this.width + n.x];
			if (!ntile.isRemembered) {
				return; //bail out -- nothing remembered here to match
			}
			if (ntile.bg !== required[i].requires) {
				return; //bail out -- tile doesn't match
			}
		}
		//Hmm, looks like a real match!
		let ofs = {
			x:at.x - required[0].x,
			y:at.y - required[0].y
		};
		console.log("Match at " + at.x + ", " + at.y + " with offset " + ofs.x + " " + ofs.y + ".");
		tile.matchOffset = ofs;
	}, this);


	this.futureMode = true;
};

GAME.finishFuture = function GAME_finishFuture(x,y) {
	let ofs = this.tiles[y*this.width+x].matchOffset;
	console.log("Match with offset " + ofs.x + " " + ofs.y);

	//all marked tiles copy from the proper offset and mark isForgotten:
	this.tiles.forEach(function(tile, tileIndex){
		if (!tile.marked) return;
		let at = {
			x:(tileIndex % this.width),
			y:Math.floor(tileIndex / this.width)
		};
		let src = {
			x:at.x + ofs.x,
			y:at.y + ofs.y
		};
		let fg = null;
		let bg = null;
		if (src.x >= 0 && src.x < this.width && src.y >= 0 && src.y < this.height) {
			let stile = this.tiles[src.y*this.width+src.x];
			if (stile.isRemembered) {
				fg = stile.fg;
				bg = stile.bg;
				stile.isForgotten = true;
			}
		}
		tile.from = {fg:fg, bg:bg};
	}, this);

	this.tiles.forEach(function(tile){
		if (!tile.marked) return;
		delete tile.isFuture;
		delete tile.isForgotten;

		tile.fg = tile.from.fg;
		tile.bg = tile.from.bg;
		tile.isRemembered = true;

		console.log(tile);
	}, this);

	//teleport player:
	this.player.x -= ofs.x;
	this.player.y -= ofs.y;

	//clean up:
	this.tiles.forEach(function(tile){
		delete tile.marked;
		delete tile.matchOffset;
	});

	this.futureMode = false;
}

GAME.tick = function GAME_tick(controls) {
	if (controls.reset.downs) {
		this.setLevel(LEVELS[LEVEL_INDEX]);
	}
	this.movePlayer(controls);

	//in present mode, forget as needed:
	if (!this.futureMode) {
		this.tiles.forEach(function(tile){
			if (tile.isForgotten) {
				tile.isRemembered = false;
			}
		});
	}

	{ //deal with touching things:
		//all overlapped tiles:
		let minX = Math.floor(this.player.x - 0.5 * PLAYER_WIDTH);
		let maxX = Math.floor(this.player.x + 0.5 * PLAYER_WIDTH);
		let minY = Math.floor(this.player.y);
		let maxY = Math.floor(this.player.y + PLAYER_HEIGHT);

		minX = Math.max(0, minX);
		maxX = Math.min(this.width-1, maxX);
		minY = Math.max(0, minY);
		maxY = Math.min(this.height-1, maxY);

		if (this.futureMode) {
			//Future mode:
			//Touch a match => present mode (and re-arrange map?)
			for (let y = minY; y <= maxY; ++y) {
				for (let x = minX; x <= maxX; ++x) {
					if (this.tiles[y*this.width+x].matchOffset) {
						this.finishFuture(x,y);
						break;
					}
				}
				if (!this.futureMode) break;
			}
		} else {
			//Present mode:
			//Touch a future => future mode!

			for (let y = minY; y <= maxY; ++y) {
				for (let x = minX; x <= maxX; ++x) {
					if (this.tiles[y*this.width+x].isFuture) {
						this.startFuture(x,y);
						break;
					}
				}
				if (this.futureMode) break;
			}
		}
	}

	//in present mode, remember as needed:
	if (!this.futureMode) {
		//mark isRemembered:
		let minX = Math.floor(this.player.x) - 2;
		let maxX = Math.floor(this.player.x) + 2;
		let minY = Math.floor(this.player.y + 0.5 * PLAYER_HEIGHT) - 2;
		let maxY = Math.floor(this.player.y + 0.5 * PLAYER_HEIGHT) + 2;
		minX = Math.max(0, minX);
		maxX = Math.min(this.width-1, maxX);
		minY = Math.max(0, minY);
		maxY = Math.min(this.height-1, maxY);
		for (let y = minY; y <= maxY; ++y) {
			for (let x = minX; x <= maxX; ++x) {
				this.tiles[y*this.width+x].isRemembered = true;
			}
		}
	}


	//resolve camera:
	this.camera.x = Math.max(this.camera.x, this.player.x - 2.0);
	this.camera.x = Math.min(this.camera.x, this.player.x + 2.0);
	this.camera.y = Math.max(this.camera.y, this.player.y - 2.0);
	this.camera.y = Math.min(this.camera.y, this.player.y + 2.0);
	this.camera.y = Math.max(this.camera.y, -1.0 + this.camera.radius);
};

GAME.draw = function GAME_draw() {
	gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);

	if (this.futureMode) {
		gl.clearColor(0.05, 0.05, 0.05, 1.0);
	} else {
		gl.clearColor(0.95, 0.95, 0.95, 1.0);
	}
	gl.clear(gl.COLOR_BUFFER_BIT);

	//convert map to tiles:
	const attribs = [];

	function push_tile(x,y,t) {
		const c = t.color;
		const uv = t.uv || TILES.blank.uv;
		push_tile_uv_c(x,y,uv,c);
	}

	function push_tile_uv_c(x,y,uv,c) {

		attribs.push(
			x+0,y+0, uv[0],uv[1], c[0],c[1],c[2],c[3],
			x+1,y+0, uv[2],uv[1], c[0],c[1],c[2],c[3],
			x+1,y+1, uv[2],uv[3], c[0],c[1],c[2],c[3],
			x+0,y+0, uv[0],uv[1], c[0],c[1],c[2],c[3],
			x+1,y+1, uv[2],uv[3], c[0],c[1],c[2],c[3],
			x+0,y+1, uv[0],uv[3], c[0],c[1],c[2],c[3]
		);
	}


	function push_rect(x,y,w,h,c) {
		const uv = TILES.blank.uv;
		attribs.push(
			x+0,y+0, uv[0],uv[1], c[0],c[1],c[2],c[3],
			x+w,y+0, uv[2],uv[1], c[0],c[1],c[2],c[3],
			x+w,y+h, uv[2],uv[3], c[0],c[1],c[2],c[3],
			x+0,y+0, uv[0],uv[1], c[0],c[1],c[2],c[3],
			x+w,y+h, uv[2],uv[3], c[0],c[1],c[2],c[3],
			x+0,y+h, uv[0],uv[3], c[0],c[1],c[2],c[3]
		);
	}

	function push_line(ax,ay,bx,by,c) {
		if (ax === bx && ay === by) return;
		let r = 0.05;
		let px = -(by-ay);
		let py = bx-ax;
		px *= r / Math.sqrt((bx-ax)*(bx-ax)+(by-ay)*(by-ay));
		py *= r / Math.sqrt((bx-ax)*(bx-ax)+(by-ay)*(by-ay));
		const uv = TILES.blank.uv;

		attribs.push(
			ax-px,ay-py, uv[0],uv[1], c[0],c[1],c[2],c[3],
			bx-px,by-py, uv[0],uv[1], c[0],c[1],c[2],c[3],
			bx+px,by+py, uv[0],uv[1], c[0],c[1],c[2],c[3],
			ax-px,ay-py, uv[0],uv[1], c[0],c[1],c[2],c[3],
			bx+px,by+py, uv[0],uv[1], c[0],c[1],c[2],c[3],
			ax+px,ay+py, uv[0],uv[1], c[0],c[1],c[2],c[3]
		);
	}


	//background layer:
	for (let y = 0; y < this.height; ++y) {
		for (let x = 0; x < this.width; ++x) {
			const tile = this.tiles[y*this.width+x];
			if (tile.bg) {
				push_tile(x,y,tile.bg);
			}
		}
	}
	//foreground layer:
	for (let y = 0; y < this.height; ++y) {
		for (let x = 0; x < this.width; ++x) {
			const tile = this.tiles[y*this.width+x];
			if (tile.fg) {
				push_tile(x,y,tile.fg);
			}
		}
	}
	//player:
	//push_tile(this.player.x - 0.5, this.player.y, ANIMATIONS.playerStand[0]);
	//DEBUG:
	push_rect(this.player.x-0.5*PLAYER_WIDTH, this.player.y, PLAYER_WIDTH, PLAYER_HEIGHT, [0.0, (this.player.grounded ? 1.0 : 0.0), 1.0, 1.0]);

	{ //memory layer:
		let remembered = new Array((this.width+2)*(this.height+2));
		for (let y = 0; y < this.height; ++y) {
			for (let x = 0; x < this.width; ++x) {
				const tile = this.tiles[y*this.width+x];
				if (tile.isRemembered) {
					remembered[(this.width+2)*(y+1)+(x+1)] = true;
				}
			}
		}
		for (let y = 0; y < this.height+1; ++y) {
			for (let x = 0; x < this.width+1; ++x) {
				let idx =
					  (remembered[(y+0)*(this.width+2)+(x+0)] ? 1 : 0)
					+ (remembered[(y+0)*(this.width+2)+(x+1)] ? 2 : 0)
					+ (remembered[(y+1)*(this.width+2)+(x+0)] ? 4 : 0)
					+ (remembered[(y+1)*(this.width+2)+(x+1)] ? 8 : 0)
				;
				push_tile(x-0.5,y-0.5,CORNER_TILESETS.remembered[idx]);
			}
		}
	}
	{ //future layer:
		let future = new Array((this.width+2)*(this.height+2));
		for (let y = 0; y < this.height; ++y) {
			for (let x = 0; x < this.width; ++x) {
				const tile = this.tiles[y*this.width+x];
				if (tile.isFuture) {
					future[(this.width+2)*(y+1)+(x+1)] = true;
				}
			}
		}
		for (let y = 0; y < this.height+1; ++y) {
			for (let x = 0; x < this.width+1; ++x) {
				let idx =
					  (future[(y+0)*(this.width+2)+(x+0)] ? 1 : 0)
					+ (future[(y+0)*(this.width+2)+(x+1)] ? 2 : 0)
					+ (future[(y+1)*(this.width+2)+(x+0)] ? 4 : 0)
					+ (future[(y+1)*(this.width+2)+(x+1)] ? 8 : 0)
				;
				push_tile(x-0.5,y-0.5,CORNER_TILESETS.future[idx]);
			}
		}
		//future requirements:
		this.tiles.forEach(function(tile, tileIndex){
			if (tile.isFuture && tile.requires) {
				let x = (tileIndex % this.width);
				let y = Math.floor(tileIndex / this.width);
				push_tile_uv_c(x,y, tile.requires.uvR, [1.0, 1.0, 1.0, 1.0]);
			}
		}, this);
	}

	/*//MORE DEBUG:
	{
		let cvxs = this.buildCollision(0,0,1.0);
		let px = this.player.x;
		let py = this.player.y;
		cvxs.forEach(function(cvx){
			const c = [Math.random(), Math.random(), Math.random(), 0.1];
			for (let i = 6; i <= cvx.corners.length; i += 2) {
				attribs.push(
					px+cvx.corners[0], py+cvx.corners[1], c[0],c[1],c[2],c[3],
					px+cvx.corners[i-4], py+cvx.corners[i-3], c[0],c[1],c[2],c[3],
					px+cvx.corners[i-2], py+cvx.corners[i-1], c[0],c[1],c[2],c[3]
				);
			}
		});

		function try_ray(origin, direction) {
			let t = 1.0;
			cvxs.forEach(function(cvx){
				let hit = cvx.vsRay(origin, direction);
				if (hit !== false) t = Math.min(t, hit);
			});
			const c = [1.0, t, 0.0, 0.5];
			push_line(px+origin.x,py+origin.y,
				px+origin.x+t*direction.x,
				py+origin.y+t*direction.y,
				c);
		}
		try_ray({x:0.0, y:0.0}, {x:1.0, y:0.0});
		try_ray({x:0.0, y:0.0}, {x:1.0, y:1.0});
	}*/

	//upload buffer:
	gl.bindBuffer(gl.ARRAY_BUFFER, BUFFERS.tiles);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attribs), gl.STREAM_DRAW);

	gl.vertexAttribPointer(
		SHADERS.textured.aPosition.location,
		2, gl.FLOAT, //size, type
		false, //normalize
		2*4+2*4+4*4, //stride
		0 //offset
	);
	gl.enableVertexAttribArray(SHADERS.textured.aPosition.location);

	gl.vertexAttribPointer(
		SHADERS.textured.aTexCoord.location,
		2, gl.FLOAT, //size, type
		false, //normalize
		2*4+2*4+4*4, //stride
		2*4 //offset
	);
	gl.enableVertexAttribArray(SHADERS.textured.aTexCoord.location);

	gl.vertexAttribPointer(
		SHADERS.textured.aColor.location,
		4, gl.FLOAT, //size, type
		false, //normalize
		2*4+2*4+4*4, //stride
		2*4+2*4 //offset
	);
	gl.enableVertexAttribArray(SHADERS.textured.aColor.location);

	gl.useProgram(SHADERS.textured);

	const aspect = CANVAS.width / CANVAS.height;
	const scale = Math.min(aspect,1.0) / this.camera.radius;

	const x = this.camera.x;
	const y = this.camera.y;

	gl.uniformMatrix4fv(
		SHADERS.textured.uMVP.location,
		false,
		new Float32Array([
			scale/aspect,0,0,0,
			0,scale,0,0,
			0,0,1,0,
			(scale/aspect)*-x,scale*-y,0,1
		])
	);

	gl.enable(gl.BLEND);
	gl.blendEquation(gl.FUNC_ADD);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	gl.drawArrays(gl.TRIANGLES, 0, attribs.length / (2+2+4));

	gl.disableVertexAttribArray(SHADERS.textured.aPosition.location);
	gl.disableVertexAttribArray(SHADERS.textured.aTexCoord.location);
	gl.disableVertexAttribArray(SHADERS.textured.aColor.location);

};

let LEVEL_INDEX = 0;
if (document.location.search != "") {
	LEVEL_INDEX = parseInt(document.location.search.substr(1));
}
GAME.setLevel(LEVELS[LEVEL_INDEX]);

//--------------------------------
//Actually drive the game:

const FRAME = document.getElementById("frame");
const CANVAS = document.getElementById("canvas");

//--------------------------------
//webgl init:

const gl = CANVAS.getContext("webgl");

TEXTURES.load();
SHADERS.load();

const BUFFERS = {};
BUFFERS.tiles = gl.createBuffer();

//--------------------------------
//Basic housekeeping:


function resized() {
	const style = getComputedStyle(FRAME);
	const size = {x:FRAME.clientWidth, y:FRAME.clientHeight};
	size.x -= parseInt(style.getPropertyValue("padding-left")) + parseInt(style.getPropertyValue("padding-right"));
	size.y -= parseInt(style.getPropertyValue("padding-top")) + parseInt(style.getPropertyValue("padding-bottom"));

	CANVAS.width = size.x;
	CANVAS.height = size.y;
	canvas.style.width = (size.x / window.devicePixelRatio) + "px";
	canvas.style.height = (size.y / window.devicePixelRatio) + "px";
}

window.addEventListener('resize', resized);
resized();

const CONTROLS = {
	left:{code:"ArrowLeft"},
	right:{code:"ArrowRight"},
	up:{code:"ArrowUp"},
	down:{code:"ArrowDown"},
	reset:{code:"Backspace"}
};
for (let name in CONTROLS) {
	CONTROLS[name].downs = 0;
	CONTROLS[name].pressed = false;
}

window.addEventListener('keydown', function(evt){
	if (!evt.repeat) {
		for (let name in CONTROLS) {
			if (CONTROLS[name].code === evt.code) {
				CONTROLS[name].downs += 1;
				CONTROLS[name].pressed = true;
			}
		}
	}
	//console.log(evt);
	evt.preventDefault();
	return false;
});

window.addEventListener('keyup', function(evt){
	for (let name in CONTROLS) {
		if (CONTROLS[name].code === evt.code) {
			CONTROLS[name].pressed = false;
		}
	}
	evt.preventDefault();
	return false;
});


function animationFrame(timestamp) {
	if (!('prevTimestamp' in animationFrame)) {
		animationFrame.prevTimestamp = timestamp;
	}
	let delta = timestamp - animationFrame.prevTimestamp;
	animationFrame.prevTimestamp = timestamp;

	//TODO: deal with non-60fps operation

	GAME.tick(CONTROLS);
	for (let name in CONTROLS) {
		CONTROLS[name].downs = 0;
	}
	GAME.draw();
	window.requestAnimationFrame(animationFrame);
}
window.requestAnimationFrame(animationFrame);
