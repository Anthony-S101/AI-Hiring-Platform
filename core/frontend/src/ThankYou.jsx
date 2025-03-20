import React from 'react';
import { useNavigate } from 'react-router-dom';

const ThankYou = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md text-center">
                <h1 className="text-3xl font-bold text-gray-800 mb-4">Thank You for Your Test!</h1>
                <p className="text-lg text-gray-600 mb-6">
                    Our HR team will get back to you shortly.
                </p>
            </div>
        </div>
    );
};

export default ThankYou;

useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", () => {
        window.history.pushState(null, "", window.location.href);
    });
}, []);
