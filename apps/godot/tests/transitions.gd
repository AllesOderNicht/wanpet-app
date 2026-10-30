extends SceneTree
var checks := 0
var failures: Array[String] = []
func _initialize() -> void: run.call_deferred()
func verify(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures.append(message)
		push_error(message)
func run() -> void:
	var pack = GameData.read_json("res://data/pet.json")
	verify(GameData.validate_pet(pack).is_empty(), "transition pack validates")
	for key in ["lie_down", "rise"]:
		verify(pack.clips[key].frames.size() == 121 and pack.clips[key].fps == 24 and not pack.clips[key].loop, key + " complete non-looping video")
	var room = load("res://scenes/room.tscn").instantiate()
	root.add_child(room)
	room.configure(GameData.read_json("res://data/interior.json"), pack)
	room.pet.automatic = false
	for tick in 120:
		await physics_frame
		if room.navigation_ready: break
	var pet: HomePet = room.pet
	verify(room.navigation_ready, "navigation ready")
	var bed: Dictionary = room.definition.interactions.filter(func(i): return i.action == "sleep")[0]
	pet.position = GameData.point(bed.position)
	verify(pet.go_to(pet.position, bed), "bed target accepted")
	for tick in 20:
		await physics_frame
		if pet.state == "lie_down": break
	verify(pet.state == "lie_down" and pet.next_life == "sleep", "arrival lies down before sleeping")
	var foot := pet.position
	for tick in 30: await physics_frame
	verify(pet.position.is_equal_approx(foot), "transition does not move collision body")
	var elapsed := pet.activity_time
	pet.stroke()
	verify(pet.state == "lie_down" and pet.next_life == "pet" and pet.activity_time == elapsed, "stroke updates next action without restarting transition")
	verify(pet.go_to(Vector2(290, 410)), "first reroute accepted")
	verify(pet.go_to(Vector2(95, 410)), "latest reroute accepted")
	verify(pet.state == "lie_down" and pet.queued_walk and pet.next_life.is_empty(), "reroute queues until posture permits walking")
	pet._physics_process(5.1)
	verify(pet.state == "rise", "queued movement first rises")
	pet._physics_process(5.1)
	verify(pet.state == "walk" and not pet.queued_walk, "rise resumes latest path")
	for tick in 600:
		await physics_frame
		if pet.state != "walk": break
	verify(pet.position.distance_to(Vector2(95, 410)) < 8, "actual navigation reaches latest target")
	pet.stroke()
	verify(pet.state == "lie_down", "standing stroke first lies down")
	pet.reduced_motion = true
	pet._physics_process(1.0 / 60.0)
	verify(pet.state == "pet" and pet.sprite.speed_scale == 0, "reduced motion skips transition and freezes artwork")
	var duration: float = pack.clips.pet.frames.size() / float(pack.clips.pet.fps)
	pet._physics_process(duration + 0.01)
	verify(pet.state == "rest", "life action finishes in resting posture")
	verify(pet.go_to(Vector2(180, 410)) and pet.state == "walk", "reduced motion skips rising delay")
	pet.reduced_motion = false
	pet.stroke()
	pet.go_to(Vector2(290, 410))
	pet.set_available(false)
	pet._physics_process(100)
	verify(not pet.visible and not pet.queued_walk and pet.next_life.is_empty(), "away cancels pending posture and route")
	verify(not pet.go_to(Vector2(95, 410)), "away rejects new route")
	pet.set_available(true)
	verify(pet.visible and pet.state == "idle" and pet.after_arrival.is_empty(), "return does not replay old commands")
	pet.stroke()
	pet._physics_process(5.1)
	verify(pet.state == "pet", "normal lie-down finishes into requested action")
	pet._physics_process(duration + 0.01)
	verify(pet.state == "rest", "normal action retains lying pose")
	verify(pet.hit_rect().has_point(Vector2.ZERO), "touch region includes foot anchor")
	print("TRANSITIONS ", JSON.stringify({"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)
