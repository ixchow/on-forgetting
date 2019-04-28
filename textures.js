"use strict";

const TEXTURES = {};

//based on: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
function loadTexture(gl, url) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);

	// Because images have to be download over the internet
	// they might take a moment until they are ready.
	// Until then put a single pixel in the texture so we can
	// use it immediately. When the image has finished downloading
	// we'll update the texture with the contents of the image.
	const level = 0;
	const internalFormat = gl.RGBA;
	const width = 1;
	const height = 1;
	const border = 0;
	const srcFormat = gl.RGBA;
	const srcType = gl.UNSIGNED_BYTE;
	const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
		width, height, border, srcFormat, srcType,
		pixel);

	const image = new Image();
	image.onload = function() {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.generateMipmap(gl.TEXTURE_2D);
	};
	image.src = url;

	return texture;
}

TEXTURES.load = function TEXTURES_load() {
	console.log("TEXTURE.load: ", gl);
	TEXTURES.tiles = loadTexture(gl, "tiles.png");
};

//TILES describes where in TEXTURES to get things to draw:
const TILES = {};

function make_tc(row, col) {
	//512x512 image with 32x32 tiles, numbered from the upper left
	//[note, upper left == image origin; webgl loads it at (0,0) ]
	return [
		0.0 + (32 * (col+0)) / 512.0,
		0.0 + (32 * (row+1)) / 512.0,
		0.0 + (32 * (col+1)) / 512.0,
		0.0 + (32 * (row+0)) / 512.0,
	];
}
TILES.blank = {
	color:[1.0,1.0,1.0,1.0],
	uv:make_tc(0,0)
};

TILES.tree = {
	color:[0.5, 0.8, 0.3, 1.0],
	uv:make_tc(2,1),
	uvR:make_tc(1,1),
};
TILES.cone = {
	color:[0.8, 0.2, 0.1, 1.0],
	uv:make_tc(2,2),
	uvR:make_tc(1,2),
};
TILES.solid = {
	color:[0.7, 0.7, 0.7, 1.0]
};
TILES.exit = {
	color:[0.2, 0.2, 0.2, 1.0]
};
TILES.cloud = {
	color:[1.0, 1.0, 1.0, 0.7]
};


const MESSAGES = {};

function make_mtc(row, col, width) {
	//512x512 image with 32x32 tiles, numbered from the upper left
	//[note, upper left == image origin; webgl loads it at (0,0) ]
	return [
		0.0 + (32 * (col+0)) / 512.0,
		0.0 + (32 * (row+1)) / 512.0,
		0.0 + (32 * (col+width)) / 512.0,
		0.0 + (32 * (row+0)) / 512.0,
	];
}

MESSAGES.move = {
	uv:make_mtc(6,0, 4.0),
};

MESSAGES.enter = {
	uv:make_mtc(5,0, 2.5),
};

MESSAGES.reset = {
	uv:make_mtc(7,0, 3.0),
};

function makeCornerTileset(row,col) {
	//Bits:
	// 4 -- 8
	// |    |
	// 1 -- 2

	// Expected grid:
	// .  .  #  .  .
	//   1  a  7  3
	// #  .  #  #  #
	//   6  b  f  d
	// .  #  #  #  .
	//   8  c  e  5
	// .  .  .  #  .
	//   0  2  9  4
	// .  .  #  .  .

	function make(r, c) {
		return {color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(r,c)}
	}
	return [
		make(row+3,col+0), //0
		make(row+0,col+0), //1
		make(row+3,col+1), //2
		make(row+0,col+3), //3
		make(row+3,col+3), //4
		make(row+2,col+3), //5
		make(row+1,col+0), //6
		make(row+0,col+2), //7
		make(row+2,col+0), //8
		make(row+3,col+2), //9
		make(row+0,col+1), //a
		make(row+1,col+1), //b
		make(row+2,col+1), //c
		make(row+1,col+3), //d
		make(row+2,col+2), //e
		make(row+1,col+2)  //f
	];
};

const CORNER_TILESETS = {};
CORNER_TILESETS.remembered = makeCornerTileset(11,1);
CORNER_TILESETS.futureCenter = makeCornerTileset(11,6);
CORNER_TILESETS.futureEdge = makeCornerTileset(11,11);
CORNER_TILESETS.futureMode = makeCornerTileset(6,11);

const ANIMATIONS = {};
ANIMATIONS.playerStand = [
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,0)},
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,1)},
];

ANIMATIONS.playerFall = [
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,0)},
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,1)},
];

ANIMATIONS.playerWalkRight = [
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,2)},
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,3)},
];

ANIMATIONS.playerWalkLeft = [
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,4)},
	{color:[1.0, 1.0, 1.0, 1.0], uv:make_tc(4,5)},
];

