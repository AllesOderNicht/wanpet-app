shader_type canvas_item;
uniform sampler2D clean_plate : source_color, filter_linear;
uniform sampler2D away_plate : source_color, filter_linear;
uniform float away = 0.0;

void fragment() {
	vec2 p = UV * vec2(853.0, 1844.0);
	float patch = (1.0 - smoothstep(593.0, 620.0, p.x))
		* smoothstep(990.0, 1008.0, p.y)
		* (1.0 - smoothstep(1318.0, 1340.0, p.y));
	COLOR = mix(texture(TEXTURE, UV), texture(clean_plate, UV), patch);
	float caption = smoothstep(30.0, 45.0, p.x) * (1.0 - smoothstep(354.0, 370.0, p.x))
		* smoothstep(337.0, 345.0, p.y) * (1.0 - smoothstep(383.0, 393.0, p.y));
	COLOR = mix(COLOR, texture(away_plate, UV), caption * away);
}
