import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const content = document.querySelector('.content');
    if (content) content.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
