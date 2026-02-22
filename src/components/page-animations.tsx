"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function PageAnimations() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const mm = gsap.matchMedia();

    mm.add("(min-width: 1px)", () => {
      /* ───── HERO ───── */
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });

      heroTl
        .from("[data-hero='badge']", {
          y: -15,
          opacity: 0,
          scale: 0.8,
          duration: 0.35,
        })
        .from(
          "[data-hero='title']",
          { y: 30, opacity: 0, duration: 0.45 },
          "-=0.15"
        )
        .from(
          "[data-hero='gradient']",
          {
            opacity: 0,
            rotation: -8,
            scale: 0.9,
            y: 10,
            duration: 0.5,
            ease: "back.out(1.4)",
          },
          "-=0.25"
        )
        .from(
          "[data-hero='desc']",
          { y: 15, opacity: 0, duration: 0.35 },
          "-=0.2"
        )
        .from("[data-hero='cta']", {
          y: 15,
          opacity: 0,
          scale: 0.9,
          duration: 0.3,
          stagger: 0.1,
          ease: "back.out(1.7)",
        }, "-=0.15")
        .from("[data-hero='stats']", {
          y: 20,
          opacity: 0,
          duration: 0.4,
          ease: "power3.out",
        }, "-=0.15")
        .from("[data-hero='scroll']", {
          opacity: 0,
          duration: 0.4,
        }, "-=0.1");

      // Hero parallax — title moves slower than content on scroll
      gsap.to("[data-hero='title']", {
        yPercent: -30,
        ease: "none",
        scrollTrigger: {
          trigger: "[data-section='hero']",
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      });
      gsap.to("[data-hero='badge']", {
        yPercent: -50,
        ease: "none",
        scrollTrigger: {
          trigger: "[data-section='hero']",
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      });

      /* ───── FEATURES ───── */
      // Section heading
      gsap.from("[data-section='features'] [data-anim='heading']", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: {
          trigger: "[data-section='features']",
          start: "top 80%",
          toggleActions: "play reverse play reverse",
        },
      });

      // Feature cards — stagger from below
      const cards = gsap.utils.toArray(
        "[data-section='features'] [data-anim='card']"
      ) as HTMLElement[];
      cards.forEach((card, i) => {
        gsap.from(card, {
          y: 50,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: card,
            start: "top 90%",
            toggleActions: "play reverse play reverse",
          },
        });
      });

      // Feature icon bounce on scroll
      gsap.utils
        .toArray("[data-anim='icon']")
        .forEach((icon) => {
          gsap.from(icon as HTMLElement, {
            scale: 0,
            rotation: -180,
            duration: 0.6,
            ease: "back.out(2)",
            scrollTrigger: {
              trigger: icon as HTMLElement,
              start: "top 85%",
              toggleActions: "play reverse play reverse",
            },
          });
        });

      /* ───── HOW IT WORKS ───── */
      gsap.from("[data-section='steps'] [data-anim='heading']", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: {
          trigger: "[data-section='steps']",
          start: "top 80%",
          toggleActions: "play reverse play reverse",
        },
      });

      const steps = gsap.utils.toArray(
        "[data-section='steps'] [data-anim='step']"
      ) as HTMLElement[];
      steps.forEach((step, i) => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: step,
            start: "top 85%",
            toggleActions: "play reverse play reverse",
          },
        });

        // Number circle — scale up + spin
        tl.from(step.querySelector("[data-anim='step-num']")!, {
          scale: 0,
          rotation: -360,
          duration: 0.6,
          ease: "back.out(2)",
        });
        // Title
        tl.from(
          step.querySelector("h3")!,
          { y: 15, opacity: 0, duration: 0.4 },
          "-=0.2"
        );
        // Description
        tl.from(
          step.querySelector("p")!,
          { y: 15, opacity: 0, duration: 0.4 },
          "-=0.2"
        );

        // Connecting arrow between steps
        if (i < steps.length - 1) {
          const arrow = step.querySelector("[data-anim='arrow']");
          if (arrow) {
            tl.from(
              arrow,
              { scaleX: 0, opacity: 0, duration: 0.4, transformOrigin: "left" },
              "-=0.3"
            );
          }
        }
      });

      /* ───── COMPARISON TABLE ───── */
      gsap.from("[data-section='comparison'] [data-anim='heading']", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: {
          trigger: "[data-section='comparison']",
          start: "top 80%",
          toggleActions: "play reverse play reverse",
        },
      });

      gsap.from("[data-section='comparison'] [data-anim='table']", {
        y: 60,
        opacity: 0,
        scale: 0.95,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: "[data-section='comparison'] [data-anim='table']",
          start: "top 85%",
          toggleActions: "play reverse play reverse",
        },
      });

      // Table rows stagger
      const rows = gsap.utils.toArray(
        "[data-section='comparison'] tbody tr"
      ) as HTMLElement[];
      rows.forEach((row, i) => {
        gsap.from(row, {
          y: 20,
          opacity: 0,
          duration: 0.5,
          delay: i * 0.1,
          scrollTrigger: {
            trigger: row,
            start: "top 90%",
            toggleActions: "play reverse play reverse",
          },
        });
      });

      /* ───── PRICING ───── */
      gsap.from("[data-section='pricing'] [data-anim='heading']", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: {
          trigger: "[data-section='pricing']",
          start: "top 80%",
          toggleActions: "play reverse play reverse",
        },
      });

      const pricingCards = gsap.utils.toArray(
        "[data-section='pricing'] [data-anim='pricing-card']"
      ) as HTMLElement[];
      pricingCards.forEach((card, i) => {
        gsap.from(card, {
          y: 80,
          opacity: 0,
          rotationX: 15,
          transformPerspective: 800,
          duration: 0.7,
          delay: i * 0.15,
          ease: "power3.out",
          scrollTrigger: {
            trigger: card,
            start: "top 90%",
            toggleActions: "play reverse play reverse",
          },
        });
      });

      // Price number — count up effect
      gsap.utils
        .toArray("[data-anim='price']")
        .forEach((el) => {
          gsap.from(el as HTMLElement, {
            textContent: 0,
            duration: 1,
            snap: { textContent: 1 },
            scrollTrigger: {
              trigger: el as HTMLElement,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          });
        });

      /* ───── CTA ───── */
      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: "[data-section='cta']",
          start: "top 80%",
          toggleActions: "play reverse play reverse",
        },
      });
      ctaTl
        .from("[data-section='cta'] h2", {
          y: 30,
          opacity: 0,
          duration: 0.6,
          ease: "power3.out",
        })
        .from(
          "[data-section='cta'] p",
          { y: 20, opacity: 0, duration: 0.5 },
          "-=0.2"
        )
        .from(
          "[data-section='cta'] a",
          {
            y: 20,
            opacity: 0,
            scale: 0.8,
            duration: 0.5,
            ease: "back.out(2)",
          },
          "-=0.2"
        );

      // CTA button glow pulse
      gsap.to("[data-section='cta'] a", {
        boxShadow: "0 0 30px rgba(255,255,255,0.4)",
        repeat: -1,
        yoyo: true,
        duration: 1.5,
        ease: "sine.inOut",
      });
    });

    return () => mm.revert();
  }, []);

  return null;
}
