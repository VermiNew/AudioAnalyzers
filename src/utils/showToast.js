const defaultOptions = {
    duration: 3000,
    close: true,
    gravity: "top",
    position: "right",
    stopOnFocus: true,
    offset: {
        x: 20,
        y: 20
    },
    style: {
        fontFamily: "Poppins, sans-serif",
        borderRadius: "8px",
        padding: "12px 24px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        fontSize: "14px"
    }
};

export const showInfoToast = (message) => {
    window.Toastify({
        ...defaultOptions,
        text: message,
        style: {
            ...defaultOptions.style,
            background: "var(--dark-primary)",
        }
    }).showToast();
};

export const showWarningToast = (message) => {
    window.Toastify({
        ...defaultOptions,
        text: message,
        style: {
            ...defaultOptions.style,
            background: "#f39c12",
        }
    }).showToast();
};

export const showErrorToast = (message) => {
    window.Toastify({
        ...defaultOptions,
        text: message,
        duration: 5000,
        style: {
            ...defaultOptions.style,
            background: "#e74c3c",
        }
    }).showToast();
}; 