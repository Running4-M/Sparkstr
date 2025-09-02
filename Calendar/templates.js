function attachTemplateEvents() {
    document.querySelectorAll(".upload-container").forEach((container, index) => {
        // Assign unique ID to each container dynamically
        const templateId = `task-${index + 1}`;
        container.dataset.templateId = templateId;
    
        // File-related elements (scoped to this template)
        const dropArea = container.querySelector(".drop-area");
        const fileInput = container.querySelector("input[type='file']");
        const fileNameDisplay = container.querySelector(".file-name-display");
    
        // URL-related elements (scoped to this template)
        const urlArea = container.querySelector(".url-area");
        const urlButton = container.querySelector(".url-button");
        const urlInput = container.querySelector("input[type='url']");
        const urlDisplay = container.querySelector(".url-display");
    
        function setDisplay(containerElem, text) {
            containerElem.innerHTML = `<span class="display-text">${text}</span><span class="delete-btn" title="Clear">&times;</span>`;
            containerElem.classList.add("active");
            containerElem.style.display = "block";
        }
    
        // Handle file selection
        function handleFiles(files) {
            if (files.length > 0) {
                const fileName = "Selected File: " + files[0].name;
                setDisplay(fileNameDisplay, fileName);
                dropArea.classList.add("active");
            } else {
                fileNameDisplay.innerHTML = "";
                fileNameDisplay.style.display = "none";
                dropArea.classList.remove("active");
            }
        }
    
        fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
    
        dropArea.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropArea.style.backgroundColor = "#bbdefb";
        });
    
        dropArea.addEventListener("dragleave", () => {
            if (!fileNameDisplay.innerHTML) dropArea.style.backgroundColor = "#e3f2fd";
        });
    
        dropArea.addEventListener("drop", (event) => {
            event.preventDefault();
            dropArea.style.backgroundColor = "#e3f2fd";
            let files = event.dataTransfer.files;
            fileInput.files = files;
            handleFiles(files);
        });
    
        dropArea.addEventListener("click", () => fileInput.click());
    
        fileNameDisplay.addEventListener("click", (event) => {
            if (event.target.classList.contains("delete-btn")) {
                event.stopPropagation(); // Prevents the click from bubbling up to dropArea
                fileInput.value = "";
                fileNameDisplay.innerHTML = "";
                fileNameDisplay.style.display = "none";
                dropArea.classList.remove("active");
            }
        });
    
        // URL input logic
        urlButton.addEventListener("click", (e) => {
            e.stopPropagation();
            if (urlInput.hidden) {
                urlInput.hidden = false;
                urlInput.focus();
                urlButton.textContent = "Submit URL";
            } else {
                if (urlInput.value.trim() !== "") {
                    setDisplay(urlDisplay, "Entered URL: " + urlInput.value);
                    urlArea.classList.add("active");
                } else {
                    urlDisplay.innerHTML = "";
                    urlDisplay.style.display = "none";
                    urlArea.classList.remove("active");
                }
                urlInput.hidden = true;
                urlButton.textContent = "Paste URL";
            }
        });
    
        urlArea.addEventListener("click", (e) => {
            if (e.target !== urlButton && urlInput.hidden) {
                urlInput.hidden = false;
                urlInput.focus();
                urlButton.textContent = "Submit URL";
            }
        });
    
        urlInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (urlInput.value.trim() !== "") {
                    setDisplay(urlDisplay, "Entered URL: " + urlInput.value);
                    urlArea.classList.add("active");
                } else {
                    urlDisplay.innerHTML = "";
                    urlDisplay.style.display = "none";
                    urlArea.classList.remove("active");
                }
                urlInput.hidden = true;
                urlButton.textContent = "Paste URL";
            }
        });
    
        urlDisplay.addEventListener("click", (event) => {
            if (event.target.classList.contains("delete-btn")) {
                event.stopPropagation(); // Optional: if urlDisplay is inside a clickable container
                urlInput.value = "";
                urlDisplay.innerHTML = "";
                urlDisplay.style.display = "none";
                urlArea.classList.remove("active");
            }
        });
    });
    
  


    // Counter logic
    document.querySelectorAll(".counter-container").forEach((container, index) => {
      // Assign unique ID dynamically
      const counterId = `counter-${index + 1}`;
      container.dataset.counterId = counterId;
  
      // Get the elements within this specific counter container
      const decreaseBtn = container.querySelector(".decrease");
      const increaseBtn = container.querySelector(".increase");
      const counterEl = container.querySelector(".counter");
  
      // Decrease button event
      decreaseBtn.addEventListener("click", () => {
          let current = parseInt(counterEl.value, 10) || 0;
          if (current > parseInt(counterEl.min, 10)) {
              current--;
          }
          counterEl.value = current;
      });
  
      // Increase button event
      increaseBtn.addEventListener("click", () => {
          let current = parseInt(counterEl.value, 10) || 0;
          if (current < parseInt(counterEl.max, 10)) {
              current++;
          }
          counterEl.value = current;
      });
  
      // Optional: validate input when user types directly
      counterEl.addEventListener("change", () => {
          let current = parseInt(counterEl.value, 10);
          if (isNaN(current) || current < parseInt(counterEl.min, 10)) {
              counterEl.value = counterEl.min;
          } else if (current > parseInt(counterEl.max, 10)) {
              counterEl.value = counterEl.max;
          }
      });
  });
  
      
    // Function to create a new input row
    function createInputRow(placeholder, name) {
      const row = document.createElement("div");
      row.className = "input-row";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "custom-input";
      input.placeholder = placeholder;
      input.name = name;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", function() {
        row.remove();
      });

      row.appendChild(input);
      row.appendChild(removeBtn);
      return row;
    }

    // Attach event listeners to all add buttons
    const addButtons = document.querySelectorAll(".add-btn");
    addButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        const targetId = btn.getAttribute("data-target");
        const container = document.getElementById(targetId);
        const placeholder = btn.getAttribute("data-placeholder");
        const name = btn.getAttribute("data-name");

        // Create and append the new input row
        const newRow = createInputRow(placeholder, name);
        container.appendChild(newRow);
      });
    });

    // Attach event listener to the "Others" button
    document.querySelectorAll(".others-group").forEach((group, index) => {
      // Assign a unique data attribute
      const othersId = `others-${index + 1}`;
      group.dataset.othersId = othersId;
    
      // Get the button and input container within this group
      const othersBtn = group.querySelector(".othersBtn");
      const othersInputContainer = group.querySelector(".othersInputContainer");
    
      // Attach the event listener to toggle the input container
      othersBtn.addEventListener("click", () => {
        if (othersInputContainer.style.display === "none" || othersInputContainer.style.display === "") {
          othersInputContainer.style.display = "block";
          // Optionally, add toggled styling:
          group.classList.add("toggled");
        } else {
          othersInputContainer.style.display = "none";
          group.classList.remove("toggled");
        }
      });
    });
}


    




  