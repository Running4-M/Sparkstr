function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("This browser does not support notifications.");
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            console.log("Notification permission granted.");
            localStorage.setItem("notificationsEnabled", "true");
            
            // Show a test notification to confirm it's working
            new Notification("Notifications Enabled", {
                body: "You will now receive event reminders!",
                icon: "/icon.png"
            });

        } else {
            console.log("Notification permission denied.");
            localStorage.setItem("notificationsEnabled", "false");
        }
    });
}


// Check if the user has already given permission when the page loads
document.addEventListener("DOMContentLoaded", () => {
    const notificationCheckbox = document.getElementById("enableNotifications");

    if (!notificationCheckbox) return; // If the checkbox is not on this page, do nothing

    const savedPreference = localStorage.getItem("notificationsEnabled");
    if (savedPreference === "true") {
        notificationCheckbox.checked = true;
    }

    notificationCheckbox.addEventListener("change", function () {
        if (this.checked) {
            requestNotificationPermission();
        } else {
            localStorage.setItem("notificationsEnabled", "false");
        }
    });
});
