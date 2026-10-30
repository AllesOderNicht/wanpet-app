class_name GameData
extends RefCounted

const DIRECTIONS = ["front", "back", "left", "right"]
static var textures: Dictionary = {}

static func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("缺少配置：" + path)
		return {}
	var parser = JSON.new()
	if parser.parse(FileAccess.get_file_as_string(path)) != OK or not parser.data is Dictionary:
		push_error("JSON 格式不正确：" + path)
		return {}
	return parser.data

static func point(value: Array) -> Vector2:
	return Vector2(float(value[0]), float(value[1]))

static func polygon(value: Array) -> PackedVector2Array:
	var result = PackedVector2Array()
	for p in value:
		result.append(point(p))
	return result

static func valid_point(value: Variant) -> bool:
	return value is Array and value.size() == 2 and value.all(func(n): return (n is float or n is int) and is_finite(n) and abs(n) <= 8192)

static func valid_polygon(value: Variant) -> bool:
	if not value is Array or value.size() < 3 or not value.all(valid_point):
		return false
	return not Geometry2D.triangulate_polygon(polygon(value)).is_empty()

static func valid_rect(value: Variant) -> bool:
	return value is Array and value.size() == 4 and value.all(func(n): return (n is float or n is int) and is_finite(n) and abs(n) <= 8192) and value[2] > 0 and value[3] > 0

static func local_asset(path: Variant) -> bool:
	return path is String and path.begins_with("res://assets/") and not ".." in path and (path.ends_with(".png") or path.ends_with(".webp"))

static func local_video(path: Variant) -> bool:
	return path is String and path.begins_with("res://assets/") and not ".." in path and path.ends_with(".ogv")

static func texture(path: String, region: Array = []) -> Texture2D:
	if not textures.has(path):
		textures[path] = load(path)
	if region.is_empty():
		return textures[path]
	var atlas = AtlasTexture.new()
	atlas.atlas = textures[path]
	atlas.region = Rect2(region[0], region[1], region[2], region[3])
	atlas.filter_clip = true
	return atlas

static func validate_room(data: Dictionary, room_ids: Array) -> Array[String]:
	var errors: Array[String] = []
	if data.get("version") != 1 or not data.get("id") in room_ids:
		errors.append("场景版本或标识不正确")
	if not valid_point(data.get("size")) or not valid_point(data.get("spawn")):
		errors.append("场景尺寸或出生点不正确")
	elif data.size[0] <= 0 or data.size[1] <= 0:
		errors.append("场景尺寸必须为正数")
	if not local_asset(data.get("background")):
		errors.append("场景背景必须是本地图片")
	if data.has("cushion_anchor_offset") and not valid_point(data.cushion_anchor_offset):
		errors.append("软垫与宠物落脚点的偏移无效")
	if data.has("reading_hotspot") and not valid_rect(data.reading_hotspot):
		errors.append("阅读热区无效")
	if data.has("reading_pose"):
		var reading = data.reading_pose
		if not reading is Dictionary or not valid_point(reading.get("entry_offset")):
			errors.append("座位姿势或入座偏移无效")
		else:
			errors.append_array(validate_clip("read", reading))
	if data.has("background_video"):
		if not local_video(data.background_video):
			errors.append("background_video 必须是 res://assets/ 下的本地 .ogv 视频")
		elif not ResourceLoader.exists(data.background_video, "VideoStreamTheora"):
			errors.append("background_video 视频素材缺失或格式无效")
	if not valid_polygon(data.get("walkable")):
		errors.append("可行走轮廓无效")
	if not data.get("objects") is Array or not data.get("interactions") is Array:
		errors.append("需要物件列表与互动点列表")
		return errors
	var ids: Array = []
	for item in data.get("objects", []):
		if not item is Dictionary:
			errors.append("物件必须为对象")
			continue
		var id = item.get("id", "")
		if not id is String or id == "" or id in ids:
			errors.append("物件标识缺失或重复：" + str(id))
		ids.append(id)
		if not valid_point(item.get("position")) or not valid_point(item.get("pivot")):
			errors.append(str(id) + "：坐标/锚点无效")
		if not local_asset(item.get("texture")) or item.get("layer") not in ["ground", "world", "foreground"]:
			errors.append(str(id) + "：贴图/层无效")
		if not (item.get("scale", 1) is float or item.get("scale", 1) is int) or not is_finite(item.get("scale", 1)) or item.get("scale", 1) <= 0 or item.get("scale", 1) > 4:
			errors.append(str(id) + "：缩放比例无效")
		if item.has("region") and not valid_rect(item.region):
			errors.append(str(id) + "：图集区域无效")
		if local_asset(item.get("texture")) and not ResourceLoader.exists(item.texture):
			errors.append(str(id) + "：缺少素材")
		if item.has("collision") and not valid_polygon(item.collision):
			errors.append(str(id) + "：碰撞轮廓无效")
		if item.has("front_part"):
			var front = item.front_part
			if not front is Dictionary:
				errors.append(str(id) + "：前沿部件必须为对象")
				continue
			if front.keys().any(func(key): return key not in ["texture", "region", "pivot", "scale", "depth_offset"]):
				errors.append(str(id) + "：前沿部件含不支持的字段")
			if not valid_point(front.get("pivot")) or not local_asset(front.get("texture")):
				errors.append(str(id) + "：前沿贴图/锚点无效")
			elif not ResourceLoader.exists(front.texture):
				errors.append(str(id) + "：缺少前沿素材")
			if front.has("region"):
				if not valid_rect(front.region) or front.region[0] < 0 or front.region[1] < 0:
					errors.append(str(id) + "：前沿图集区域无效")
				elif local_asset(front.get("texture")) and ResourceLoader.exists(front.texture):
					var front_texture = texture(front.texture)
					if front_texture == null or front.region[0] + front.region[2] > front_texture.get_width() or front.region[1] + front.region[3] > front_texture.get_height():
						errors.append(str(id) + "：前沿区域超出图集")
			var front_scale = front.get("scale", item.get("scale", 1))
			if not (front_scale is float or front_scale is int) or not is_finite(front_scale) or front_scale <= 0 or front_scale > 4:
				errors.append(str(id) + "：前沿缩放比例无效")
			var depth = front.get("depth_offset")
			if not (depth is float or depth is int) or not is_finite(depth) or abs(depth) > 8192:
				errors.append(str(id) + "：前沿排序偏移无效")
	for field in ["life_spots", "life_slots"]:
		if data.has(field) and not data[field] is Dictionary:
			errors.append(field + " 必须为对象")
			continue
		for spot in data.get(field, {}):
			if not spot is String or spot == "":
				errors.append(field + "：地点标识无效")
			var slot = data[field][spot]
			if field == "life_spots":
				if not valid_point(slot): errors.append(str(spot) + "：生活地点坐标无效")
				continue
			if not slot is Dictionary:
				errors.append(str(spot) + "：生活位置必须为对象")
				continue
			if slot.keys().any(func(key): return key not in ["object_id", "offset", "position", "facing", "pose", "contact"]):
				errors.append(str(spot) + "：生活位置含不支持的字段")
			if slot.has("object_id") == slot.has("position"):
				errors.append(str(spot) + "：需要且只能指定物件或绝对位置")
			if slot.has("object_id") and (not slot.object_id is String or slot.object_id not in ids):
				errors.append(str(spot) + "：生活位置引用了无效物件")
			if slot.has("position") and not valid_point(slot.position):
				errors.append(str(spot) + "：生活位置坐标无效")
			if slot.has("offset") and (not slot.has("object_id") or not valid_point(slot.offset)):
				errors.append(str(spot) + "：物件站位偏移无效")
			if slot.get("facing", "front") not in DIRECTIONS or slot.get("pose", "idle") not in ["idle", "rest", "eat", "sleep", "pet"]:
				errors.append(str(spot) + "：生活位置朝向/姿态无效")
			if slot.has("contact") and not valid_point(slot.contact):
				errors.append(str(spot) + "：生活接触点无效")
	for item in data.get("interactions", []):
		if not item is Dictionary or not valid_point(item.get("position")):
			errors.append("互动点坐标无效")
			continue
		if item.get("action") not in ["sleep", "eat", "door"]:
			errors.append("不支持的互动动作")
		if item.has("hotspot") and not valid_rect(item.hotspot):
			errors.append("互动热区无效")
		if item.get("action") == "door" and (item.get("room") not in room_ids or not valid_point(item.get("spawn"))):
			errors.append("门口目标无效")
	return errors

static func validate_pet(data: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	if data.get("version") != 2 or not data.get("clips") is Dictionary:
		return ["需要 PetPack v2 与 clips"]
	for field in ["scale", "speed"]:
		if not (data.get(field) is float or data.get(field) is int) or not is_finite(data.get(field)) or data.get(field) <= 0:
			errors.append("宠物 " + field + " 必须为有限正数")
	var required: Array = ["sleep", "eat", "pet"]
	for optional in ["read", "rest"]:
		if data.clips.has(optional): required.append(optional)
	if data.has("contacts"):
		if not data.contacts is Dictionary:
			errors.append("宠物接触点必须是对象")
		else:
			for contact in data.contacts.values():
				if not valid_point(contact): errors.append("宠物接触点必须是有限坐标")
	for direction in DIRECTIONS:
		required.append("walk_" + direction)
		required.append("idle_" + direction)
	for transition in ["lie_down", "rise"]:
		if data.clips.has(transition): required.append(transition)
	for key in required:
		errors.append_array(validate_clip(key, data.clips.get(key, {})))
	return errors


static func validate_clip(key: String, clip: Dictionary) -> Array[String]:
	var errors: Array[String] = []
	var frames = clip.get("frames", [])
	var ground_speed = clip.get("ground_speed", 1.0)
	if not (ground_speed is float or ground_speed is int) or not is_finite(ground_speed) or ground_speed <= 0:
		errors.append(key + "：落脚速度无效")
	var stride = clip.get("stride_frames", maxi(frames.size(), 1))
	if not (stride is float or stride is int) or not is_finite(stride) or stride <= 0 or stride > maxi(frames.size(), 1):
		errors.append(key + "：步态周期无效")
	var clip_scale = clip.get("scale", 1.0)
	if not (clip_scale is float or clip_scale is int) or not is_finite(clip_scale) or clip_scale <= 0 or clip_scale > 8:
		errors.append(key + "：动作素材比例无效")
	if frames.size() < (4 if key.begins_with("walk_") else 1):
		errors.append(key + "：动作帧不足")
	if not clip.get("fps") is float and not clip.get("fps") is int:
		errors.append(key + "：缺少 fps")
	elif not is_finite(clip.fps) or clip.fps < 1 or clip.fps > 24:
		errors.append(key + "：fps 超出范围")
	for f in frames:
		if not f is Dictionary or not local_asset(f.get("texture")) or not valid_point(f.get("anchor")):
			errors.append(key + "：帧图片或锚点无效")
			continue
		var rect = f.get("rect", [])
		if not rect is Array or rect.size() != 4 or not rect.all(func(n): return (n is float or n is int) and is_finite(n) and n >= 0 and floor(n) == n):
			errors.append(key + "：帧区域无效")
			continue
		if rect[2] < 1 or rect[3] < 1:
			errors.append(key + "：空帧")
		var duration = f.get("duration", 1.0)
		if not (duration is float or duration is int) or not is_finite(duration) or duration <= 0 or duration > 60:
			errors.append(key + "：帧时长无效")
		if f.has("foreground"):
			var front = f.foreground
			if not valid_rect(front) or front[0] < 0 or front[1] < 0 or front[0] + front[2] > rect[2] or front[1] + front[3] > rect[3]:
				errors.append(key + "：前景身体部件超出动作帧")
		if ResourceLoader.exists(f.texture):
			var t = texture(f.texture)
			if t == null or rect[0] + rect[2] > t.get_width() or rect[1] + rect[3] > t.get_height():
				errors.append(key + "：帧超出图集")
		else:
			errors.append(key + "：缺少图片 " + f.texture)
	return errors
