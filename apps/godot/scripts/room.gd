class_name HomeRoom
extends Node2D

signal door_requested(target: Dictionary)
signal hint_changed(message: String)
signal reading_requested

const PET_SCENE = preload("res://scenes/pet.tscn")
var definition: Dictionary
var world := Node2D.new()
var region := NavigationRegion2D.new()
var pet: HomePet
var navigation_ready := false
var prop_nodes: Dictionary = {}
var prop_front_nodes: Dictionary = {}
var ambient_time := 0.0
var reduce_motion := false
var life: Node
var background_video: VideoStreamPlayer

func configure(data: Dictionary, pet_pack: Dictionary, spawn: Variant = null) -> void:
	definition = data
	var background = Sprite2D.new()
	background.texture = GameData.texture(data.background)
	background.centered = false
	var dimensions := GameData.point(data.size)
	var ratios: Vector2 = dimensions / background.texture.get_size()
	if data.get("background_fit", "stretch") == "cover":
		background.scale = Vector2.ONE * maxf(ratios.x, ratios.y)
		background.position = (dimensions - background.texture.get_size() * background.scale) * GameData.point(data.get("background_position", [0.5, 0.5]))
	else:
		background.scale = ratios
	background.z_index = -10
	add_child(background)
	if data.has("background_video"):
		_add_background_video(background, data.background_video)
	world.y_sort_enabled = true
	add_child(world)
	var source = NavigationMeshSourceGeometryData2D.new()
	source.add_traversable_outline(GameData.polygon(data.walkable))
	for item in data.objects:
		_add_prop(item)
		if item.has("collision"):
			var outline = GameData.polygon(item.collision)
			for i in outline.size():
				outline[i] += GameData.point(item.position)
			source.add_obstruction_outline(outline)
	var nav = NavigationPolygon.new()
	nav.agent_radius = 8.0
	nav.cell_size = 1.0
	NavigationServer2D.bake_from_source_geometry_data(nav, source)
	region.navigation_polygon = nav
	add_child(region)
	pet = PET_SCENE.instantiate()
	pet.position = GameData.point(data.spawn) if spawn == null else spawn
	world.add_child(pet)
	var room_pet := pet_pack.duplicate(true)
	if data.has("reading_pose"):
		room_pet.clips.read = data.reading_pose.duplicate(true)
	pet.configure(room_pet, self)
	pet.door_reached.connect(func(target): door_requested.emit(target))
	pet.activity_changed.connect(func(activity):
		hint_changed.emit({"idle": "在家，自在休息", "rest": "舒服地趴一会儿", "lie_down": "慢慢趴下来", "rise": "伸伸腿，慢慢起身", "walk": "正在散步", "sleep": "在猫窝打盹", "eat": "在食盆边吃东西", "pet": "喜欢你的轻轻抚摸"}.get(activity, "")))
	_enable_navigation.call_deferred()

func _add_background_video(background: Sprite2D, path: Variant) -> void:
	if not GameData.local_video(path) or not ResourceLoader.exists(path, "VideoStreamTheora"):
		push_error("background_video 必须指向存在的本地 .ogv 视频；保留静态背景")
		return
	background_video = VideoStreamPlayer.new()
	background_video.stream = load(path)
	background_video.expand = true
	# Video and poster share the exact same cover transform and scene coordinates.
	background_video.size = background.texture.get_size()
	background_video.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background_video.loop = true
	background_video.volume = 0.0
	background.add_child(background_video)
	background_video.play()
	_sync_background_video()

func _sync_background_video() -> void:
	if is_instance_valid(background_video) and is_inside_tree():
		background_video.paused = reduce_motion or not is_visible_in_tree() or not can_process()
		background_video.visible = not reduce_motion

func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED:
		_sync_background_video()
	elif what in [NOTIFICATION_PAUSED, NOTIFICATION_DISABLED]:
		if is_instance_valid(background_video): background_video.paused = true
	elif what in [NOTIFICATION_UNPAUSED, NOTIFICATION_ENABLED]:
		# Godot updates the inherited process owner after delivering these notifications.
		_sync_background_video.call_deferred()

func _enable_navigation() -> void:
	# The first map iteration can still be empty while its region is synchronized.
	for attempt in 120:
		if not is_inside_tree():
			return
		await get_tree().physics_frame
		if not is_inside_tree():
			return
		var map = region.get_navigation_map()
		if NavigationServer2D.map_get_iteration_id(map) > 0 and NavigationServer2D.map_get_closest_point_owner(map, to_global(pet.position)) == region.get_rid():
			navigation_ready = true
			pet.navigation_ready = true
			return
	push_error("导航地图未就绪：" + str(definition.id))

func _add_prop(item: Dictionary) -> void:
	var root = Node2D.new()
	root.name = item.id
	root.position = GameData.point(item.position)
	var image = Sprite2D.new()
	image.texture = GameData.texture(item.texture, item.get("region", []))
	image.centered = false
	var scale_factor = float(item.get("scale", 1))
	image.scale = Vector2.ONE * scale_factor
	image.position = -GameData.point(item.pivot) * scale_factor
	root.add_child(image)
	if item.layer == "world":
		world.add_child(root)
	else:
		root.z_index = -5 if item.layer == "ground" else 10
		add_child(root)
	if item.has("collision"):
		var body = StaticBody2D.new()
		var shape = CollisionPolygon2D.new()
		shape.polygon = GameData.polygon(item.collision)
		body.add_child(shape)
		root.add_child(body)
	prop_nodes[item.id] = root
	if item.has("front_part"):
		var part: Dictionary = item.front_part
		var front = Node2D.new()
		front.name = str(item.id) + "_front"
		var depth = Vector2(0, float(part.depth_offset))
		front.position = root.position + depth
		var front_image = Sprite2D.new()
		front_image.texture = GameData.texture(part.texture, part.get("region", []))
		front_image.centered = false
		var front_scale = float(part.get("scale", item.get("scale", 1)))
		front_image.scale = Vector2.ONE * front_scale
		# Move only the sorting origin; the artwork stays anchored to its prop.
		front_image.position = -GameData.point(part.pivot) * front_scale - depth
		front.add_child(front_image)
		world.add_child(front)
		prop_front_nodes[item.id] = front

func move_prop(id: String, position: Vector2) -> bool:
	if not prop_nodes.has(id) or not GameData.valid_point([position.x, position.y]):
		return false
	for item in definition.get("objects", []):
		if item.id != id: continue
		# Collision props require a navigation rebake before they can move.
		if item.has("collision"): return false
		item.position = [position.x, position.y]
		prop_nodes[id].position = position
		if prop_front_nodes.has(id):
			prop_front_nodes[id].position = position + Vector2(0, float(item.front_part.depth_offset))
		return true
	return false

func life_slot(spot: String) -> Dictionary:
	var slots = definition.get("life_slots", {})
	if slots is Dictionary and slots.has(spot):
		var slot = slots[spot]
		if not slot is Dictionary: return {}
		var origin := Vector2.ZERO
		var destination: Vector2
		if slot.has("object_id"):
			if not prop_nodes.has(slot.object_id) or not GameData.valid_point(slot.get("offset", [0, 0])): return {}
			origin = prop_nodes[slot.object_id].position
			destination = origin + GameData.point(slot.get("offset", [0, 0]))
		elif GameData.valid_point(slot.get("position")):
			destination = GameData.point(slot.position)
		else:
			return {}
		# Unspecified and legacy slots use the standing front pose.
		var result := {"position": [destination.x, destination.y], "facing": slot.get("facing", "front"), "pose": slot.get("pose", "idle")}
		if slot.has("contact"):
			if not GameData.valid_point(slot.contact): return {}
			var contact = origin + GameData.point(slot.contact)
			result.contact = [contact.x, contact.y]
		return result
	var legacy = definition.get("life_spots", {})
	if legacy is Dictionary and GameData.valid_point(legacy.get(spot)):
		return {"position": legacy[spot].duplicate(), "facing": "front", "pose": "idle"}
	return {}

func show_facilities(facilities: Dictionary) -> void:
	for id in ["food-bowl", "water-bowl"]:
		var kind := "food" if id == "food-bowl" else "water"
		if prop_nodes.has(id) and facilities.get(kind) is Dictionary:
			var image = prop_nodes[id].get_child(0)
			image.modulate = Color.WHITE
			if float(facilities[kind].get("portions", 0)) <= 0: image.modulate = Color(0.75, 0.75, 0.75)
	if prop_nodes.has("cat-toilet") and facilities.get("toilet") is Dictionary:
		var dirty := 1.0 - float(facilities.toilet.get("cleanliness", 1))
		prop_nodes["cat-toilet"].get_child(0).modulate = Color.WHITE.lerp(Color(0.76, 0.72, 0.62), dirty * 0.5)

func path_to(from: Vector2, to: Vector2) -> PackedVector2Array:
	if not navigation_ready:
		return PackedVector2Array()
	var route = NavigationServer2D.map_get_path(region.get_navigation_map(), to_global(from), to_global(to), true)
	for index in route.size():
		route[index] = to_local(route[index])
	return route

func random_destination(rng: RandomNumberGenerator) -> Vector2:
	var bounds = GameData.point(definition.size)
	for attempt in 20:
		var destination = Vector2(rng.randf_range(25, bounds.x - 25), rng.randf_range(bounds.y * 0.4, bounds.y - 25))
		if Geometry2D.is_point_in_polygon(destination, GameData.polygon(definition.walkable)):
			var path = path_to(pet.position, destination)
			if not path.is_empty() and path[-1].distance_to(destination) < 8:
				return destination
	return pet.position

func interact_at(local_point: Vector2) -> void:
	if not pet.available:
		hint_changed.emit("小伙伴正在旅行，回来后再陪它玩吧")
		return
	if life:
		if pet.state == "read" and definition.has("reading_pose") and pet.hit_rect().has_point(local_point - pet.position):
			life.touch()
			return
		var reading_hotspot: Array = definition.get("reading_hotspot", [])
		if not reading_hotspot.is_empty() and Rect2(reading_hotspot[0], reading_hotspot[1], reading_hotspot[2], reading_hotspot[3]).has_point(local_point):
			reading_requested.emit()
			hint_changed.emit("邀请它来桌边坐坐，翻一翻小书")
			return
		if pet.hit_rect().has_point(local_point - pet.position): life.touch()
		elif Geometry2D.is_point_in_polygon(local_point, GameData.polygon(definition.walkable)): life.invite(local_point)
		return
	if pet.hit_rect().has_point(local_point - pet.position):
		pet.stroke()
		return
	for target in definition.interactions:
		var hotspot: Array = target.get("hotspot", [target.position[0] - 22, target.position[1] - 30, 44, 45])
		if Rect2(hotspot[0], hotspot[1], hotspot[2], hotspot[3]).has_point(local_point):
			if not pet.go_to(GameData.point(target.position), target):
				hint_changed.emit("这里暂时走不到")
			return
	if not pet.go_to(local_point):
		hint_changed.emit("请点选可以走动的地面")

func set_options(automatic: bool, reduced: bool) -> void:
	reduce_motion = reduced
	_sync_background_video()
	pet.automatic = automatic and not reduced and life == null
	pet.reduced_motion = reduced
	if reduced and pet.seat_transition:
		var leaving := pet.queued_walk
		pet._cancel_seat_transition()
		if leaving:
			pet.queued_walk = false
			pet._set_state("walk")
	if life: life.set_options(automatic, reduced)
	pet._play_pose()

func _process(delta: float) -> void:
	if reduce_motion:
		return
	ambient_time += delta
	for item in definition.get("objects", []):
		if item.get("ambient", false):
			prop_nodes[item.id].get_child(0).rotation = sin(ambient_time * 0.8) * 0.009
