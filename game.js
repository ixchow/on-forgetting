"use strict";
//Based, in part, on code from http://tchow.com/games/card-w2016/card

//gl stuff based in part on the MDN webgl tutorials:
// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Adding_2D_content_to_a_WebGL_context
//and also based on the 15-466-f18 notes:
// http://graphics.cs.cmu.edu/courses/15-466-f18/notes/gl-helpers.js

const PLAYER_HEIGHT = 0.7;
const PLAYER_WIDTH = 0.6;

const GRAVITY = 7.0;
const JUMP = 4.0;
const JUMP_TIME = 1.5;
const SPEED = 3.0;

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
			} else if (t === 'e') {
				tile.bg = TILES.exit;
			} else if (t === '#') {
				tile.fg = TILES.solid;
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
		radius:5.0,
		x:this.player.x,
		y:this.player.y
	};

};

GAME.isSolid = function GAME_isSolid(x,y) {
	if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
	return this.tiles[y * this.width + x].fg !== null;
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

/*
//returns hit time and point {t:, pt:}
Convex.prototype.vsCapsuleRay = function Convex_vsCapsuleRay(origin, direction, radius) {
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
*/


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

GAME.tick = function GAME_tick(controls) {
/*
	{ //figure out if player is on the ground:
		let ix = Math.floor(this.player.x);
		let iy = Math.floor(this.player.y);
		let mx = Math.floor(this.player.x - 0.5 * PLAYER_WIDTH);
		let Mx = Math.ceil(this.player.x + 0.5 * PLAYER_WIDTH);
	}

*/

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

/*
	//fancy version
	{
		let cvxs = this.buildCollision(sx,sy,1.0); //use large-ish radius 'cause
		function closestPoint(c) {
			let closest = {x:NaN, y:NaN, ox:NaN, oy:NaN, dis2:Infinity};
			cvxs.forEach(function(cvx){
				let pt = cvx.closestPoint(c);
				if (pt.dis2 < closest.dis2) {
					closest = pt;
				}
			});
			return closest;
		}
		function vsLevel(origin, direction) {
			let t = 1.0;
			cvxs.forEach(function(cvx){
				let hit = cvx.vsRay(origin, direction);
				if (hit !== false) t = Math.min(t, hit);
			});
			return t;
		}

		const EPS = 1e-3;

		let px = 0;
		let py = 0;

		//scoot at least EPS away from walls:
		let adjustments = 0;
		for (let iter = 0; iter < 10; ++iter) {
			let close = closestPoint({x:px, y:py});
			if (close.dis2 >= EPS*EPS) break; //success
			console.log(close);
			let out = {x:close.ox, y:close.oy};
			if (close.dis2 != 0.0) {
				out.x = (close.x - px) / Math.sqrt(close.dis2);
				out.y = (close.y - py) / Math.sqrt(close.dis2);
			}
			//try to adjust based on point location:
			px += out.x * EPS;
			py += out.y * EPS;
			++adjustments;
		}
		if (adjustments > 0) console.log("Adjustments: " + adjustments);

		//also clamp velocity based on walls:
		if (!(this.player.vx === 0.0 && this.player.vy === 0.0)) {
			let v = {
				x: this.player.vx,
				y: this.player.vy
			};
			const len2 = v.x*v.x + v.y*v.y;
			if (len2 > 4.0*EPS*4.0*EPS) {
				v.x /= Math.sqrt(len2) * 4.0 * EPS;
				v.y /= Math.sqrt(len2) * 4.0 * EPS;
			}
			let t = vsLevel({x:px, y:py}, v);

			//if velocity hits a nearby wall, slide:
			if (t < 1.0) {
				let dx = 0.0;
				let dy = 0.0;
				let ddot = 0.0;
				DIRECTIONS.forEach(function(direction){
					const dot = direction.x*this.player.vx + direction.y*this.player.vy;
					if (dot < ddot) return;

					let o = { x: px, y: py };
					let d = {
						x: 4.0 * EPS * direction.x,
						y: 4.0 * EPS * direction.y
					};
					let t = vsLevel(o,d);
					if (t === 1.0) {
						ddot = dot;
						dx = direction.x;
						dy = direction.y;
					}
				}, this);

				this.player.vx = ddot * dx;
				this.player.vy = ddot * dy;
				sx = this.player.vx * TICK;
				sy = this.player.vy * TICK;
			}
		}

		//now do move using a pair of rays:
		//(this is probably not needed any more)
		if (sx !== 0.0 || sy !== 0.0) {
			let perp = {
				x:-sy,
				y:sx
			};
			perp.x /= Math.sqrt(perp.x*perp.x+perp.y*perp.y);
			perp.y /= Math.sqrt(perp.x*perp.x+perp.y*perp.y);

			let o1 = {
				x: px - 0.5*EPS*perp.x,
				y: py - 0.5*EPS*perp.y
			};
			let o2 = {
				x: px + 0.5*EPS*perp.x,
				y: py + 0.5*EPS*perp.y
			}

			const t1 = vsLevel(o1,{x:sx, y:sy});
			const t2 = vsLevel(o2,{x:sx, y:sy});

			const t = Math.min(t1,t2);

			px += t * sx;
			py += t * sy;

			sx *= (1.0 - t);
			sy *= (1.0 - t);
		}

		//check for grounding:
		if (this.player.vy > 0) {
			this.player.grounded = false;
		} else {
			const t = vsLevel({x:px, y:py},{x:0.0, y:-0.01});
			this.player.grounded = (t < 1.0);
		}

		this.player.x += px;
		this.player.y += py;
	}
*/

};

GAME.draw = function GAME_draw() {
	gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);

	gl.clearColor(0.95, 0.95, 0.95, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	//convert map to tiles:
	const attribs = [];

	function push_tile(x,y,t) {
		const c = t.color;

		attribs.push(
			x+0,y+0, c[0],c[1],c[2],c[3],
			x+1,y+0, c[0],c[1],c[2],c[3],
			x+1,y+1, c[0],c[1],c[2],c[3],
			x+0,y+0, c[0],c[1],c[2],c[3],
			x+1,y+1, c[0],c[1],c[2],c[3],
			x+0,y+1, c[0],c[1],c[2],c[3]
		);
	}

	function push_rect(x,y,w,h,c) {
		attribs.push(
			x+0,y+0, c[0],c[1],c[2],c[3],
			x+w,y+0, c[0],c[1],c[2],c[3],
			x+w,y+h, c[0],c[1],c[2],c[3],
			x+0,y+0, c[0],c[1],c[2],c[3],
			x+w,y+h, c[0],c[1],c[2],c[3],
			x+0,y+h, c[0],c[1],c[2],c[3]
		);
	}

	function push_line(ax,ay,bx,by,c) {
		if (ax === bx && ay === by) return;
		let r = 0.05;
		let px = -(by-ay);
		let py = bx-ax;
		px *= r / Math.sqrt((bx-ax)*(bx-ax)+(by-ay)*(by-ay));
		py *= r / Math.sqrt((bx-ax)*(bx-ax)+(by-ay)*(by-ay));

		attribs.push(
			ax-px,ay-py, c[0],c[1],c[2],c[3],
			bx-px,by-py, c[0],c[1],c[2],c[3],
			bx+px,by+py, c[0],c[1],c[2],c[3],
			ax-px,ay-py, c[0],c[1],c[2],c[3],
			bx+px,by+py, c[0],c[1],c[2],c[3],
			ax+px,ay+py, c[0],c[1],c[2],c[3]
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
	push_rect(this.player.x-0.5*PLAYER_WIDTH, this.player.y, PLAYER_WIDTH, PLAYER_HEIGHT, [1.0, (this.player.grounded ? 1.0 : 0.0), 1.0, 0.1]);

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
		SHADERS.solid.aPosition.location,
		2, gl.FLOAT, //size, type
		false, //normalize
		2*4+4*4, //stride
		0 //offset
	);
	gl.enableVertexAttribArray(SHADERS.solid.aPosition.location);

	gl.vertexAttribPointer(
		SHADERS.solid.aColor.location,
		4, gl.FLOAT, //size, type
		false, //normalize
		2*4+4*4, //stride
		2*4 //offset
	);
	gl.enableVertexAttribArray(SHADERS.solid.aColor.location);

	gl.useProgram(SHADERS.solid);

	const aspect = CANVAS.width / CANVAS.height;
	const scale = Math.min(aspect,1.0) / this.camera.radius;

	const x = this.camera.x;
	const y = this.camera.y;

	gl.uniformMatrix4fv(
		SHADERS.solid.uMVP.location,
		false,
		new Float32Array([
			scale/aspect,0,0,0,
			0,scale,0,0,
			0,0,1,0,
			(scale/aspect)*-x,scale*-y,0,1
		])
	);

	gl.drawArrays(gl.TRIANGLES, 0, attribs.length / (2+4));

	gl.disableVertexAttribArray(SHADERS.solid.aPosition.location);
	gl.disableVertexAttribArray(SHADERS.solid.aColor.location);

};

GAME.setLevel(LEVELS[0]);

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
	down:{code:"ArrowDown"}
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
