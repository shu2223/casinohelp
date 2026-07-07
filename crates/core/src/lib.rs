pub fn health() -> &'static str {
    "ok"
}

#[cfg(test)]
mod tests {
    #[test]
    fn health_check() {
        assert_eq!(crate::health(), "ok");
    }
}
