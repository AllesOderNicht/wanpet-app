class_name HomePet
extends CharacterBody2D

signal activity_changed(activity: String)
signal door_reached(target: Dictionary)

var pack: Dictionary
var sprite := AnimatedSprite2D.new()
var navigation := NavigationAgent2D.new()
var state := "idle"
var facing := "front"
var after_arrival: Dictionary = {}
var queued_walk := false
var next_life := ""
var automatic := true
var reduced_motion := false
var available := true
var external_hold := false
var navigation_ready := false
var activity_time := 0.0
var idle_remaining := 6.0
var speed := 48.0
var walk_speed := 0.0
var room: Node2D
var rng := RandomNumberGenerator.new()
var pose_ghost := Sprite2D.new()
var pose_tween: Tween
var pose_front := Sprite2D.new()
var seat_tween: Tween
var seat_transition := false

func configure(data: Dictionary, parent_room: Node2D) -> void:
	pack = data
	room = parent_room
	speed = float(pack.get("speed", 48))
	var shape = CollisionShape2D.new()
	var circle = CircleShape2D.new()
	circle.radius = 7
	shape.shape = circle
	add_child(shape)
	add_child(pose_ghost)
	pose_ghost.visible = false
	pose_ghost.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	add_child(sprite)
	# Authored paws can sit above a tabletop while the body stays behind it.
	pose_front.z_index = 1
	pose_front.visible = false
	sprite.add_child(pose_front)
	sprite.scale = Vector2.ONE * float(pack.get("scale", 0.19))
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var frames = SpriteFrames.new()
	frames.remove_animation("default")
	for key in pack.clips:
		var clip: Dictionary = pack.clips[key]
		frames.add_animation(key)
		frames.set_animation_speed(key, float(clip.fps))
		frames.set_animation_loop(key, bool(clip.get("loop", true)))
		for frame in clip.frames:
			frames.add_frame(key, GameData.texture(frame.texture, frame.rect), float(frame.get("duration", 1.0)))
	sprite.sprite_frames = frames
	sprite.frame_changed.connect(_align_frame)
	sprite.animation_changed.connect(_align_frame)
	add_child(navigation)
	navigation.path_desired_distance = 3
	navigation.target_desired_distance = 3
	navigation.path_max_distance = 12
	rng.randomize()
	_set_state(pack.get("initial_state", "idle"))

func _align_frame() -> void:
	var clip: Dictionary = pack.clips.get(String(sprite.animation), {})
	var frames: Array = clip.get("frames", [])
	if frames.is_empty():
		return
	var frame: Dictionary = frames[mini(sprite.frame, frames.size() - 1)]
	# Animation atlases may use a different pixel density than the life-action sheets.
	sprite.scale = Vector2.ONE * float(pack.scale) * float(clip.get("scale", 1.0))
	sprite.offset = Vector2(frame.rect[2], frame.rect[3]) / 2.0 - GameData.point(frame.anchor)
	pose_front.visible = frame.has("foreground")
	if pose_front.visible:
		var front: Array = frame.foreground
		pose_front.texture = GameData.texture(frame.texture, [frame.rect[0] + front[0], frame.rect[1] + front[1], front[2], front[3]])
		pose_front.position = Vector2(front[0] + front[2] / 2.0, front[1] + front[3] / 2.0) - GameData.point(frame.anchor)

func contact_offset(action: String) -> Vector2:
	var contact = pack.get("contacts", {}).get(action)
	return GameData.point(contact) if GameData.valid_point(contact) else Vector2.ZERO

func _set_state(next: String) -> void:
	var outgoing_position := sprite.position
	_cancel_seat_transition()
	if state != "walk" or next != "walk":
		walk_speed = 0.0
	state = next
	activity_time = 0.0
	activity_changed.emit(state)
	_play_pose(outgoing_position)

func _cancel_seat_transition() -> void:
	if seat_tween: seat_tween.kill()
	seat_transition = false
	sprite.position = Vector2.ZERO

func _seat_offset() -> Vector2:
	return GameData.point(pack.clips.get("read", {}).get("entry_offset", [0, 0]))

func _leave_seat() -> void:
	_cancel_seat_transition()
	seat_transition = true
	sprite.set_frame_and_progress(0, 0)
	sprite.pause()
	seat_tween = create_tween()
	seat_tween.tween_interval(0.15)
	seat_tween.tween_property(sprite, "position", _seat_offset(), 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	seat_tween.tween_callback(func():
		seat_transition = false
		queued_walk = false
		_set_state("walk")
	)

func _play_pose(outgoing_position := Vector2.ZERO) -> void:
	var clip = ("walk_" if state == "walk" else "idle_") + facing if state in ["walk", "idle"] else (("rest" if pack.clips.has("rest") else "sleep") if state == "rest" else state)
	if sprite.animation != clip:
		if pack.get("transition_mode") == "crossfade" and not reduced_motion and sprite.sprite_frames.has_animation(sprite.animation):
			var old_walking := String(sprite.animation).begins_with("walk_")
			var new_walking := String(clip).begins_with("walk_")
			if not (old_walking and new_walking):
				if pose_tween: pose_tween.kill()
				pose_ghost.texture = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
				pose_ghost.scale = sprite.scale
				pose_ghost.offset = sprite.offset
				pose_ghost.position = outgoing_position
				pose_ghost.modulate.a = 1.0
				pose_ghost.visible = true
				sprite.modulate.a = 0.0
				pose_tween = create_tween().set_parallel()
				pose_tween.tween_property(pose_ghost, "modulate:a", 0.0, 0.08)
				pose_tween.tween_property(sprite, "modulate:a", 1.0, 0.08)
		var continue_stride: bool = String(sprite.animation).begins_with("walk_") and String(clip).begins_with("walk_")
		var phase := 0.0
		if continue_stride:
			var old_clip: Dictionary = pack.clips[String(sprite.animation)]
			var stride: float = old_clip.get("stride_frames", old_clip.frames.size())
			phase = fposmod((sprite.frame + sprite.frame_progress) / stride, 1.0)
		sprite.play(clip)
		if continue_stride:
			var next_clip: Dictionary = pack.clips[clip]
			var stride: float = next_clip.get("stride_frames", next_clip.frames.size())
			var frame_position := phase * stride
			sprite.set_frame_and_progress(int(frame_position), fposmod(frame_position, 1.0))
	sprite.speed_scale = 0.0 if reduced_motion else 1.0

func _facing_for(direction: Vector2) -> String:
	# Keep the current axis near diagonals; tiny path changes must not flicker direction.
	var horizontal := facing in ["left", "right"]
	if absf(direction.x) > absf(direction.y) * 1.2:
		horizontal = true
	elif absf(direction.y) > absf(direction.x) * 1.2:
		horizontal = false
	return ("right" if direction.x > 0 else "left") if horizontal else ("front" if direction.y > 0 else "back")

func set_available(value: bool) -> void:
	if available == value: return
	available = value
	visible = value
	velocity = Vector2.ZERO
	after_arrival = {}
	queued_walk = false
	next_life = ""
	if pack:
		_set_state(pack.get("initial_state", "idle"))

func go_to(destination: Vector2, interaction: Dictionary = {}, manual: bool = true) -> bool:
	if not available or not navigation_ready:
		return false
	var path: PackedVector2Array = room.path_to(room.to_local(global_position), destination)
	if path.size() < 1 or path[-1].distance_to(destination) > 12:
		return false
	if manual:
		idle_remaining = 10.0
	after_arrival = interaction.duplicate(true)
	navigation.target_position = room.to_global(path[-1])
	next_life = ""
	if state == "read" and _seat_offset() != Vector2.ZERO and not reduced_motion:
		queued_walk = true
		_leave_seat()
		return true
	if state in ["sleep", "eat", "pet", "read", "rest", "lie_down", "rise"]:
		queued_walk = true
		if state not in ["lie_down", "rise"]:
			_start_transition("rise")
	else:
		queued_walk = false
		_set_state("walk")
	return true

func _start_life(action: String) -> void:
	_set_state(action)
	sprite.play(action)
	sprite.set_frame_and_progress(0, 0.0)

func _begin_life(action: String) -> void:
	velocity = Vector2.ZERO
	queued_walk = false
	if action == "read" and _seat_offset() != Vector2.ZERO:
		next_life = ""
		_start_life(action)
		if not reduced_motion:
			seat_transition = true
			sprite.position = _seat_offset()
			seat_tween = create_tween()
			seat_tween.tween_property(sprite, "position", Vector2.ZERO, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			seat_tween.tween_callback(func(): seat_transition = false)
		return
	next_life = action
	if state in ["sleep", "eat", "pet", "read", "rest"]:
		next_life = ""
		_start_life(action)
	elif state not in ["lie_down", "rise"]:
		facing = "front"
		_start_transition("lie_down")

func _start_transition(kind: String) -> void:
	velocity = Vector2.ZERO
	if reduced_motion or pack.get("transition_mode") == "crossfade" or not pack.clips.has(kind):
		_finish_transition(kind)
		return
	_set_state(kind)
	sprite.play(kind)
	sprite.set_frame_and_progress(0, 0.0)

func _finish_transition(kind: String) -> void:
	if kind == "lie_down":
		if queued_walk:
			_start_transition("rise")
		elif not next_life.is_empty():
			var action := next_life
			next_life = ""
			_start_life(action)
		else:
			_set_state("rest")
	else:
		facing = "front"
		if queued_walk:
			queued_walk = false
			_set_state("walk")
		elif not next_life.is_empty():
			_start_transition("lie_down")
		else:
			_set_state("idle")

func stroke() -> void:
	if available:
		after_arrival = {}
		idle_remaining = 10.0
		_begin_life("pet")

func hit_rect() -> Rect2:
	var clip: Dictionary = pack.clips[String(sprite.animation)]
	var frame: Dictionary = clip.frames[sprite.frame]
	return Rect2(-GameData.point(frame.anchor) * sprite.scale, Vector2(frame.rect[2], frame.rect[3]) * sprite.scale).grow(4)

func _physics_process(delta: float) -> void:
	if not available or not navigation_ready:
		return
	if seat_transition:
		return
	activity_time += delta
	if state in ["lie_down", "rise"]:
		var clip: Dictionary = pack.clips[state]
		if reduced_motion or activity_time >= clip.frames.size() / float(clip.fps):
			_finish_transition(state)
		return
	if state == "walk":
		if navigation.is_navigation_finished():
			velocity = Vector2.ZERO
			var target = after_arrival
			after_arrival = {}
			if target.get("action") == "door":
				_set_state("idle")
				door_reached.emit(target)
			else:
				facing = target.get("facing", facing)
				var action: String = target.get("action", "idle")
				if action in ["sleep", "eat", "pet", "read"]:
					_begin_life(action)
				else:
					_set_state(action)
				idle_remaining = rng.randf_range(5, 10)
			return
		var direction = navigation.get_next_path_position() - global_position
		if direction.length() > 0.1:
			facing = _facing_for(direction)
			# Ease speed only; keep navigation direction exact around furniture.
			var remaining := global_position.distance_to(navigation.target_position)
			var desired_speed := speed * clampf(remaining / 24.0, 0.0, 1.0)
			walk_speed = move_toward(walk_speed, desired_speed, speed * 4.0 * delta)
			velocity = direction.normalized() * minf(walk_speed, direction.length() / maxf(delta, 0.001))
			var before := global_position
			move_and_slide()
			_play_pose()
			if not reduced_motion:
				var clip: Dictionary = pack.clips[String(sprite.animation)]
				var ground_speed: float = clip.get("ground_speed", speed)
				sprite.speed_scale = clampf(global_position.distance_to(before) / maxf(delta * ground_speed, 0.001), 0.0, 2.0)
		else:
			velocity = Vector2.ZERO
			sprite.speed_scale = 0.0
		# A bad or newly blocked route must not keep the pet walking forever.
		if activity_time > 20:
			_set_state("idle")
	elif state in ["sleep", "eat", "pet", "read"]:
		if external_hold: return
		var clip: Dictionary = pack.clips[state]
		var duration := 0.0
		for frame in clip.frames:
			duration += float(frame.get("duration", 1.0)) / float(clip.fps)
		duration *= {"sleep": 3, "eat": 2, "pet": 1, "read": 3}[state]
		if activity_time >= duration:
			_set_state("rest")
			idle_remaining = rng.randf_range(6, 10)
	elif state == "idle" and not external_hold and pack.get("initial_state") == "rest" and activity_time > 3.0:
		_set_state("rest")
	elif automatic and not reduced_motion:
		idle_remaining -= delta
		if idle_remaining <= 0:
			idle_remaining = 6
			var options: Array = room.definition.interactions.filter(func(i): return i.action in ["sleep", "eat"])
			if not options.is_empty() and rng.randf() < 0.5:
				var target: Dictionary = options[rng.randi_range(0, options.size() - 1)]
				go_to(GameData.point(target.position), target, false)
			else:
				go_to(room.random_destination(rng), {}, false)
