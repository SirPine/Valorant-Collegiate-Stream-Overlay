import obspython as obs
import os

# Path to your images
image_folder_path = "C:/Users/aron/Desktop/stream/teams/"
team_slot = "Team Slot"  # OBS source name for the team image slot
team_text_slot = "Team Text Slot"  # OBS source name for the team text slot

# Define the available teams (based on your image names)
teams = {
    0: {"name": "", "image": None},  # Default to show nothing
    1: {"name": "Akron", "image": "Akron.png"},
    2: {"name": "Ball State", "image": "Ball State.png"},
    3: {"name": "BGS", "image": "Bowling Green State.png"},
    4: {"name": "Central Michigan", "image": "Central Michigan.png"},
    5: {"name": "Eastern Michigan", "image": "Eastern Michigan.png"},
    6: {"name": "Kent State", "image": "Kent State.png"},
    7: {"name": "Miami", "image": "Miami.png"},
    8: {"name": "Northeastern", "image": "Northeastern.png"},
    9: {"name": "Northern Illinois", "image": "Northern Illinois.png"},
    10: {"name": "Ohio", "image": "Ohio.png"},
    11: {"name": "Toledo", "image": "Toledo.png"},
    12: {"name": "Western Michigan", "image": "Western Michigan.png"}
}

# Define positions (x, y coordinates in pixels)
team_position = (1433, 325)  # Position for the image (x, y)
text_center_position = (1512, 513)  # Center position for the text (x, y)

# Function to update the team image and text, and center the text
def set_team_image_and_text(team_info, position, text_center):
    source_image = obs.obs_get_source_by_name(team_slot)
    source_text = obs.obs_get_source_by_name(team_text_slot)

    # Update the team image
    if source_image is not None:
        settings = obs.obs_source_get_settings(source_image)
        
        if team_info["image"]:  # If a team is selected, show the image
            image_file = os.path.join(image_folder_path, team_info["image"])
            obs.obs_data_set_string(settings, "file", image_file)
        else:  # Otherwise, show nothing (clear the image)
            obs.obs_data_set_string(settings, "file", "")

        obs.obs_source_update(source_image, settings)

        # Get the scene from the source and update the position
        scene = obs.obs_scene_from_source(obs.obs_frontend_get_current_scene())
        if scene is not None:
            scene_item = obs.obs_scene_find_source(scene, team_slot)
            if scene_item is not None:
                pos = obs.vec2()
                pos.x = position[0]
                pos.y = position[1]
                obs.obs_sceneitem_set_pos(scene_item, pos)

        obs.obs_data_release(settings)
        obs.obs_source_release(source_image)

    # Update the team name text and center it
    if source_text is not None:
        text_settings = obs.obs_source_get_settings(source_text)
        obs.obs_data_set_string(text_settings, "text", team_info["name"])
        obs.obs_source_update(source_text, text_settings)

        # Get the scene from the text source and update the text position
        scene_item_text = obs.obs_scene_find_source(scene, team_text_slot)
        if scene_item_text is not None:
            text_size = obs.vec2()
            obs.obs_sceneitem_get_scale(scene_item_text, text_size)  # Get the text size
            text_width = text_size.x
            text_height = text_size.y

            # Center the text on the desired position
            centered_pos = obs.vec2()
            centered_pos.x = text_center[0] - (text_width / 2)  # X centered
            centered_pos.y = text_center[1] - (text_height / 2)  # Y centered
            obs.obs_sceneitem_set_pos(scene_item_text, centered_pos)

        obs.obs_data_release(text_settings)
        obs.obs_source_release(source_text)

# Called when the script settings change
def script_update(settings):
    team_id = obs.obs_data_get_int(settings, "team_id")
    
    # Set the image and text for the selected team
    set_team_image_and_text(teams[team_id], team_position, text_center_position)

# Define the settings for the script (i.e., team selection)
def script_properties():
    props = obs.obs_properties_create()

    # Dropdown for selecting the team
    team_list = obs.obs_properties_add_list(props, "team_id", "Select Team", obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_INT)

    # Add an option for "None" to show no image or text
    obs.obs_property_list_add_int(team_list, "None", 0)

    # Populate the dropdown with team choices
    for team_id, team_info in teams.items():
        if team_info["image"]:  # Only add real teams to the list
            obs.obs_property_list_add_int(team_list, team_info["name"], team_id)

    return props

# Description of the script
def script_description():
    return "Automatically select, place, and center team images and names for the tournament, with an option to show nothing."
