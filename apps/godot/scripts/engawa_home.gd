class_name EngawaHome
extends Control

signal open_requested(page: String)
signal courtyard_requested

const ART_SIZE := Vector2(853, 1844)
var visual_only := false
var canvas := Control.new()
var cat := AnimatedSprite2D.new()
var cat_definition: Dictionary
var reduced := false
var pet_available := true
var menu: VBoxContainer
var menu_dismiss: Button
var plate := ShaderMaterial.new()

func _ready() -> void:
	clip_contents = true
	add_child(canvas)
	canvas.size = ART_SIZE
	var background := TextureRect.new()
	background.texture = load("res://assets/engawa/home-reference.png")
	background.size = ART_SIZE
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.shader = load("res://shaders/engawa_plate.gdshader")
	plate.set_shader_parameter("clean_plate", load("res://assets/engawa/home-clean.png"))
	plate.set_shader_parameter("away_plate", load("res://assets/engawa/home-away.png"))
	background.material = plate
	canvas.add_child(background)
	cat_definition = GameData.read_json("res://data/engawa-pet.json")
	var atlases: Dictionary = {}
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	frames.add_animation("rest")
	frames.set_animation_speed("rest", float(cat_definition.fps))
	for frame in cat_definition.frames:
		var texture := AtlasTexture.new()
		var path: String = frame.get("texture", cat_definition.get("texture", ""))
		if not atlases.has(path):
			atlases[path] = load(path)
		texture.atlas = atlases[path]
		texture.region = Rect2(frame.rect[0], frame.rect[1], frame.rect[2], frame.rect[3])
		frames.add_frame("rest", texture, float(frame.get("duration", 1.0)))
	cat.sprite_frames = frames
	cat.position = GameData.point(cat_definition.position)
	cat.scale = GameData.point(cat_definition.scale)
	cat.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	cat.frame_changed.connect(_align_cat)
	canvas.add_child(cat)
	cat.play("rest")
	_align_cat()
	if not visual_only:
		_hotspot("准备行囊", Rect2(22, 1538, 581, 248), func(): open_requested.emit("bag"))
		_hotspot("收藏", Rect2(625, 1540, 190, 247), func(): open_requested.emit("collection"))
		_hotspot("去庭院", Rect2(638, 770, 172, 109), func(): courtyard_requested.emit())
		_hotspot("轻轻抚摸小猫", Rect2(75, 1030, 500, 280), stroke)
		_hotspot("菜单", Rect2(735, 53, 100, 108), _toggle_menu)
		menu_dismiss = Button.new()
		menu_dismiss.size = ART_SIZE
		menu_dismiss.focus_mode = Control.FOCUS_NONE
		for style in ["normal", "hover", "pressed", "focus"]:
			menu_dismiss.add_theme_stylebox_override(style, StyleBoxEmpty.new())
		menu_dismiss.pressed.connect(_toggle_menu)
		canvas.add_child(menu_dismiss)
		menu_dismiss.hide()
		menu = VBoxContainer.new()
		menu.position = Vector2(493, 165)
		menu.size = Vector2(320, 0)
		menu.add_theme_constant_override("separation", 5)
		canvas.add_child(menu)
		for item in [["trip", "查看旅途"], ["activity", "小屋活动"], ["settings", "小屋设置"]]:
			var button := Button.new()
			button.text = item[1]
			button.custom_minimum_size = Vector2(320, 100)
			button.add_theme_font_size_override("font_size", 32)
			button.pressed.connect(func(): open_requested.emit(item[0]))
			menu.add_child(button)
		menu.hide()
	resized.connect(_fit)
	_fit()
	set_pet_available(pet_available)
	set_reduced_motion(reduced)

func _hotspot(label: String, bounds: Rect2, action: Callable) -> Button:
	var button := Button.new()
	button.name = label
	button.tooltip_text = label
	button.accessibility_name = label
	button.position = bounds.position
	button.size = bounds.size
	button.set_meta("bounds", bounds)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	button.add_theme_stylebox_override("hover", StyleBoxEmpty.new())
	var pressed := StyleBoxFlat.new()
	pressed.bg_color = Color(0.25, 0.22, 0.15, 0.08)
	pressed.set_corner_radius_all(16)
	button.add_theme_stylebox_override("pressed", pressed)
	var focus := StyleBoxFlat.new()
	focus.bg_color = Color.TRANSPARENT
	focus.border_color = Color("#d36f47")
	focus.set_border_width_all(3)
	focus.set_corner_radius_all(16)
	button.add_theme_stylebox_override("focus", focus)
	button.pressed.connect(action)
	canvas.add_child(button)
	return button

func _fit() -> void:
	var factor := minf(size.x / ART_SIZE.x, size.y / ART_SIZE.y)
	canvas.scale = Vector2.ONE * factor
	canvas.position = (size - ART_SIZE * factor) * 0.5
	if factor > 0:
		for child in canvas.get_children():
			if child is Button and child.has_meta("bounds"):
				var bounds: Rect2 = child.get_meta("bounds")
				child.size = bounds.size.max(Vector2.ONE * 44.0 / factor)
				child.position = bounds.get_center() - child.size * 0.5

func _toggle_menu() -> void:
	menu.visible = not menu.visible
	menu_dismiss.visible = menu.visible
	if menu.visible:
		menu.get_child(0).grab_focus()
	else:
		canvas.get_node("菜单").grab_focus()

func _unhandled_key_input(event: InputEvent) -> void:
	if is_instance_valid(menu) and menu.visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_toggle_menu()
		get_viewport().set_input_as_handled()

func set_pet_available(value: bool) -> void:
	pet_available = value
	cat.visible = value
	if not is_node_ready():
		return
	_update_playback()
	plate.set_shader_parameter("away", 0.0 if value else 1.0)
	var previous := canvas.get_node_or_null("Away")
	if previous:
		canvas.remove_child(previous)
		previous.queue_free()
	if not value and not visual_only:
		var away := Label.new()
		away.name = "Away"
		away.text = "等它慢慢回家"
		away.position = Vector2(47, 340)
		away.size = Vector2(650, 65)
		away.add_theme_font_size_override("font_size", 38)
		away.add_theme_color_override("font_color", Color("#66543f"))
		var font := SystemFont.new()
		font.font_names = PackedStringArray(["Kaiti SC", "Songti SC", "PingFang SC"])
		away.add_theme_font_override("font", font)
		canvas.add_child(away)

func set_reduced_motion(value: bool) -> void:
	reduced = value
	_update_playback()

func stroke() -> void:
	if pet_available and not reduced:
		cat.set_frame_and_progress(0, 0.0)
		cat.play("rest")

func _update_playback() -> void:
	if not is_node_ready():
		return
	if reduced or not pet_available:
		cat.pause()
	else:
		cat.play("rest")

func _align_cat() -> void:
	var frame: Dictionary = cat_definition.frames[cat.frame]
	cat.offset = Vector2(frame.rect[2], frame.rect[3]) / 2.0 - GameData.point(frame.anchor)

func seek_pose(seconds: float) -> void:
	cat.pause()
	var total := 0.0
	for frame in cat_definition.frames:
		total += float(frame.get("duration", 1.0)) / float(cat_definition.fps)
	var remaining := fposmod(seconds, total)
	for index in cat_definition.frames.size():
		var duration := float(cat_definition.frames[index].get("duration", 1.0)) / float(cat_definition.fps)
		if remaining < duration:
			cat.set_frame_and_progress(index, remaining / duration)
			_align_cat()
			return
		remaining -= duration
