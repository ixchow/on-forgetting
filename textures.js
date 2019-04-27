"use strict";

const TEXTURES = {};

TEXTURES.load = function TEXTURES_load() {
	console.log("TEXTURE.load: ", gl);
};

//TILES describes where in TEXTURES to get things to draw:
const TILES = {};
TILES.tree = {
	color:[0.5, 0.8, 0.3, 1.0]
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

const ANIMATIONS = {};
ANIMATIONS.playerStand = [
	{color:[0.8, 0.2, 0.2, 1.0]},
	{color:[0.7, 0.2, 0.2, 1.0]},
];
